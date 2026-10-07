import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CandidateScope } from '../src/nested-candidate.js';
import type { BindingUsageRecord, VerifiedSessionIdentity } from '../src/session-binding-contract.js';
import { ClaudeSessionBindingProvider, claudeBindingProfiles, claudeProjectDirName, type ClaudeBindingOptions } from '../src/session-binding-claude.js';

// Synthetic fixtures only: no native Claude process, model call, user transcript or settings.
const hook = resolve(import.meta.dirname, '../scripts/claude-session-hook.mjs');
const privateText = 'SYNTHETIC-PRIVATE-CONTENT';
const connectCommand = 'node "/skills/harness-connect/scripts/connect.mjs" connect --origin http://127.0.0.1:4100 --product claude_code --task-name demo';
const quiet = () => Date.now() + 60000; // transcripts look finished unless a test says otherwise
let root: string; let receipts: string; let projects: string; let projectDir: string; let cwd: string; let otherProjectDir: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'hd-claude-binding-')));
  receipts = join(root, 'state', 'claude-receipts');
  projects = join(root, 'claude', 'projects'); cwd = join(root, 'repo');
  projectDir = join(projects, claudeProjectDirName(cwd)); otherProjectDir = join(projects, claudeProjectDirName(join(root, 'other')));
  mkdirSync(projectDir, { recursive: true }); mkdirSync(otherProjectDir); mkdirSync(join(cwd, 'sub'), { recursive: true }); mkdirSync(join(root, 'other'));
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const provider = (extra: Partial<ClaudeBindingOptions> = {}) => new ClaudeSessionBindingProvider({ receiptDir: receipts, claudeProjectsDir: projects,
  projectRoot: cwd, allowCandidateProfiles: true, now: quiet, ...extra });
const rootPath = (sid: string, dir = projectDir) => join(dir, `${sid}.jsonl`);
const childPath = (sid: string, agent: string) => join(projectDir, sid, 'subagents', `agent-${agent}.jsonl`);
function runHook(input: Record<string, unknown>, claudePid = process.pid) {
  const result = spawnSync(process.execPath, [hook, 'record', '--dir', receipts], { input: JSON.stringify(input),
    env: { ...process.env, CLAUDE_PID: String(claudePid) }, encoding: 'utf8' });
  expect(result.status).toBe(0); expect(result.stdout).toBe('');
}
function locate(sessionId: string) {
  const result = spawnSync(process.execPath, [hook, 'locate', '--dir', receipts], { env: { ...process.env, CLAUDE_CODE_SESSION_ID: sessionId }, encoding: 'utf8' });
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as { receipt: string | null; reason?: string; role?: string };
}
const common = (sid: string, event: string, at = cwd) => ({ session_id: sid, transcript_path: rootPath(sid), cwd: at, hook_event_name: event, permission_mode: 'default' });
function connect(sid: string, extra: Record<string, unknown> = {}, claudePid = process.pid) {
  runHook({ ...common(sid, 'PreToolUse'), tool_name: 'Bash', tool_use_id: 'toolu_' + randomUUID().replaceAll('-', ''),
    tool_input: { command: connectCommand, description: privateText }, ...extra }, claudePid);
}
function subagent(sid: string, agent: string, event: 'SubagentStart' | 'SubagentStop', transcript = childPath(sid, agent)) {
  runHook({ ...common(sid, event), agent_id: agent, agent_type: 'general-purpose',
    ...(event === 'SubagentStop' ? { agent_transcript_path: transcript, last_assistant_message: privateText, stop_hook_active: false } : {}) });
}
const userRow = (sid: string, at: string, extra: Record<string, unknown> = {}) => ({ type: 'user', sessionId: sid, version: '2.1.291', cwd, timestamp: at, ...extra,
  message: { role: 'user', content: privateText } });
function assistant(sid: string, request: string, tokens: [number, number, number, number], extra: Record<string, unknown> = {}, model = 'claude-opus-5-5') {
  const [input, write, read, output] = tokens;
  return { type: 'assistant', sessionId: sid, version: '2.1.291', timestamp: '2026-10-07T01:00:00.000Z', requestId: request, ...extra,
    message: { id: 'msg_' + request, model, content: [{ type: 'text', text: privateText }],
      usage: { input_tokens: input, cache_creation_input_tokens: write, cache_read_input_tokens: read, output_tokens: output } } };
}
const lines = (rows: unknown[]) => rows.map(row => JSON.stringify(row) + '\n').join('');
function writeRoot(sid: string, rows: unknown[] = [], dir = projectDir) {
  writeFileSync(rootPath(sid, dir), lines([userRow(sid, '2026-10-07T00:59:00.000Z'), ...rows]), { mode: 0o600 });
}
function writeChild(sid: string, agent: string, rows: unknown[]) {
  mkdirSync(join(projectDir, sid, 'subagents'), { recursive: true }); writeFileSync(childPath(sid, agent), lines(rows), { mode: 0o600 });
}
const childRow = (sid: string, agent: string, at: string) => userRow(sid, at, { agentId: agent, isSidechain: true });
/** Mirrors the integration coordinator's scopeFor(), which reads nativeMapping. */
const scopeFor = (identities: VerifiedSessionIdentity[]): CandidateScope => ({ projectId: 'project-1', taskId: 'task-1', allowedRootTurnIds: ['binding-observation'],
  sessions: identities.map(value => ({ sessionId: value.sessionId, rootSessionId: value.nativeMapping?.nativeSessionId ?? value.sessionId,
    parentSessionId: value.parentSessionId, sourceId: value.sessionId, product: value.product,
    nativeSessionId: value.nativeMapping?.nativeSessionId ?? value.sessionId, processId: value.nativeMapping?.processId ?? null, agentId: value.nativeMapping?.agentId ?? null })) });
const ids = (records: BindingUsageRecord[]) => records.map(r => r.requestId);
async function currentIdentity(sid: string, p = provider()) {
  const located = locate(sid); expect(located.receipt).toMatch(/^[a-f0-9-]{36}$/);
  return p.resolveCurrent({ receipt: located.receipt! });
}
function forgedReceipt(sid: string, transcript: string, claudePid: number) {
  const receipt = randomUUID();
  mkdirSync(join(receipts, 'connect'), { recursive: true, mode: 0o700 });
  writeFileSync(join(receipts, 'connect', `${receipt}.json`), JSON.stringify({ schema_version: 1, kind: 'connect', receipt_id: receipt, session_id: sid,
    agent_id: null, agent_type: null, transcript_path: transcript, agent_transcript_path: null, cwd, claude_pid: claudePid,
    recorded_at: new Date().toISOString(), uid: process.getuid?.() ?? null }), { mode: 0o600 });
  return receipt;
}

describe('Claude current-session identity', () => {
  it('binds the session that the hook observed and stores no content', async () => {
    const sid = randomUUID(); writeRoot(sid); connect(sid);
    const identity = await currentIdentity(sid);
    expect(identity).toEqual({ product: 'claude_code', productVersion: '2.1.291', sessionId: sid, sourceRef: rootPath(sid),
      sourceIdentity: expect.stringMatching(/^[a-f0-9]{64}$/) as string, cwd, identityEvidenceId: expect.stringMatching(/^claude-session:/) as string,
      parentSessionId: null, createdAt: '2026-10-07T00:59:00.000Z', nativeMapping: { nativeSessionId: sid, processId: null, agentId: null } });
    const stored = readdirSync(join(receipts, 'connect')).map(name => readFileSync(join(receipts, 'connect', name), 'utf8')).join('');
    expect(stored).not.toContain(privateText); expect(stored).not.toContain('--task-name');
  });

  it('returns a byte-identical identity for repeated skill calls, cwd changes and hook copies', async () => {
    const sid = randomUUID(); writeRoot(sid); const p = provider();
    const toolUse = { tool_use_id: 'toolu_same' };
    connect(sid, toolUse); connect(sid, toolUse);
    expect(readdirSync(join(receipts, 'connect'))).toHaveLength(1);
    const first = await currentIdentity(sid, p);
    rmSync(join(receipts, 'connect'), { recursive: true });
    connect(sid, { cwd: join(cwd, 'sub') });
    expect(JSON.stringify(await currentIdentity(sid, p))).toBe(JSON.stringify(first));
  });

  it('does not accept environment, other-process or ambiguous evidence in the locator', () => {
    const sid = randomUUID(); const other = randomUUID(); writeRoot(sid); writeRoot(other);
    connect(sid);
    // A Bash command can set CLAUDE_CODE_SESSION_ID; it only narrows lookup.
    expect(locate(other)).toEqual({ receipt: null, reason: 'hook_receipt_missing' });
    connect(other, {}, 999999);
    expect(locate(other)).toEqual({ receipt: null, reason: 'hook_receipt_missing' });
    expect(locate('not-a-session')).toEqual({ receipt: null, reason: 'current_identity_unavailable' });
    symlinkSync(join(root, 'missing'), join(receipts, 'connect', `${randomUUID()}.json`));
    expect(locate(sid).receipt).not.toBeNull();
    writeChild(sid, 'a1', [childRow(sid, 'a1', '2026-10-07T01:00:00.000Z')]);
    connect(sid, { agent_id: 'a1', agent_type: 'general-purpose' });
    expect(locate(sid)).toEqual({ receipt: null, reason: 'hook_receipt_ambiguous' });
  });

  it('records only the connect command and subagent metadata, and nothing after deletion', async () => {
    const sid = randomUUID();
    runHook({ ...common(sid, 'PreToolUse'), tool_name: 'Bash', tool_use_id: 'toolu_1', tool_input: { command: 'npm test' } });
    runHook({ ...common(sid, 'UserPromptSubmit'), prompt: privateText });
    expect(() => readdirSync(join(receipts, 'connect'))).toThrow();
    subagent(sid, 'a1', 'SubagentStop');
    const stop = readFileSync(join(receipts, 'sessions', sid, 'agents', 'a1.subagent_stop.json'), 'utf8');
    expect(stop).not.toContain(privateText); expect(JSON.parse(stop)).not.toHaveProperty('last_assistant_message');
    await provider().forgetSession(sid);
    subagent(sid, 'a2', 'SubagentStart'); connect(sid);
    expect(() => readdirSync(join(receipts, 'sessions', sid))).toThrow();
    expect(() => readdirSync(join(receipts, 'connect'))).toThrow();
  });

  it('fails closed for unqualified, unknown, expired, loose, dead-process and other-project evidence', async () => {
    const sid = randomUUID(); writeRoot(sid); connect(sid); const receipt = locate(sid).receipt!;
    expect(claudeBindingProfiles.every(profile => profile.status === 'candidate')).toBe(true);
    const production = provider({ allowCandidateProfiles: false });
    expect(production.capabilities().productionSupported).toBe(false);
    await expect(production.resolveCurrent({ receipt })).rejects.toThrow('claude_source_version_unsupported');
    await expect(provider({ profiles: [{ version: '9.9.9', status: 'qualified', evidence: 'x' }] }).resolveCurrent({ receipt })).rejects.toThrow('claude_source_version_unsupported');
    chmodSync(join(receipts, 'connect', `${receipt}.json`), 0o644);
    await expect(provider().resolveCurrent({ receipt })).rejects.toThrow('claude_receipt_untrusted');
    chmodSync(join(receipts, 'connect', `${receipt}.json`), 0o600);
    // An expired receipt is refused and pruned.
    await expect(provider({ now: () => Date.now() + 3600000 }).resolveCurrent({ receipt })).rejects.toThrow('claude_receipt_expired');
    expect(readdirSync(join(receipts, 'connect'))).not.toContain(`${receipt}.json`);
    // Forged receipts: an exited process is refused.
    const exited = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
    await expect(provider().resolveCurrent({ receipt: forgedReceipt(sid, rootPath(sid), Number(exited.stdout)) })).rejects.toThrow('claude_process_absent');
    // Another project's session is refused from paths alone; its unreadable transcript is never opened.
    const foreign = randomUUID(); writeRoot(foreign, [], otherProjectDir); chmodSync(rootPath(foreign, otherProjectDir), 0o000);
    await expect(provider().resolveCurrent({ receipt: forgedReceipt(foreign, rootPath(foreign, otherProjectDir), process.pid) })).rejects.toThrow('claude_project_mismatch');
    // Documented local-trust limit: a same-user forgery naming a live session of this project is not detectable.
    const sibling = randomUUID(); writeRoot(sibling);
    expect((await provider().resolveCurrent({ receipt: forgedReceipt(sibling, rootPath(sibling), process.pid) })).sessionId).toBe(sibling);
  });
});

describe('Claude family relations', () => {
  it('links hook-evidenced subagents once they have rows and reports unevidenced member files', async () => {
    const sid = randomUUID(); const other = randomUUID(); writeRoot(sid); writeRoot(other); connect(sid); const p = provider();
    const parent = await currentIdentity(sid, p);
    writeChild(sid, 'a1', [childRow(sid, 'a1', '2026-10-07T01:05:00.000Z')]); writeChild(sid, 'a2', []); writeChild(sid, 'zz', []); writeChild(sid, 'a3', []); writeChild(sid, 'a4', []); writeChild(sid, 'a5', []);
    subagent(sid, 'a1', 'SubagentStart'); subagent(sid, 'a1', 'SubagentStart'); subagent(sid, 'a1', 'SubagentStop');
    subagent(sid, 'a2', 'SubagentStop', join(root, 'elsewhere.jsonl'));
    subagent(other, 'a3', 'SubagentStart');
    // Same session ID but another root transcript is not relation evidence for this parent.
    runHook({ ...common(sid, 'SubagentStart'), transcript_path: rootPath(other), agent_id: 'a4', agent_type: 'general-purpose' });
    subagent(sid, 'a5', 'SubagentStart');
    const found = await p.discoverChildren(parent);
    expect(found.children.map(c => [c.parentSessionId, c.identity.sessionId, c.identity.parentSessionId, c.identity.createdAt, c.relationEvidenceId === c.identity.identityEvidenceId]))
      .toEqual([[sid, `${sid}:a1`, sid, '2026-10-07T01:05:00.000Z', true]]);
    expect(found.gaps).toEqual(['binding_ancestry_unverified']);
    expect(found.children[0]!.identity.nativeMapping).toEqual({ nativeSessionId: sid, processId: null, agentId: 'a1' });
    // a5 has no rows yet; it is linked later with its first own-row time, and a1 stays byte-identical.
    appendFileSync(childPath(sid, 'a5'), lines([childRow(sid, 'a5', '2026-10-07T00:30:00.000Z')]));
    const later = await p.discoverChildren(parent);
    expect(later.children.map(c => [c.identity.sessionId, c.identity.createdAt])).toEqual([[`${sid}:a1`, '2026-10-07T01:05:00.000Z'], [`${sid}:a5`, '2026-10-07T00:30:00.000Z']]);
    expect(JSON.stringify(later.children[0])).toBe(JSON.stringify(found.children[0]));
    expect(await p.discoverChildren(later.children[0]!.identity)).toEqual({ children: [], gaps: [] });
  });

  it('reports a member whose own rows cannot be attributed instead of dropping it', async () => {
    const sid = randomUUID(); writeRoot(sid); connect(sid); const p = provider(); const parent = await currentIdentity(sid, p);
    // Rows without the agent marker (undocumented field absent) are not attributable to a1.
    writeChild(sid, 'a1', [userRow(sid, '2026-10-07T01:00:00.000Z'), assistant(sid, 'req_x', [1, 0, 0, 1])]);
    // A first own row behind more than one metadata window is still found.
    writeChild(sid, 'a2', [{ type: 'user', sessionId: sid, agentId: 'a2', pad: 'x'.repeat(1100000) }, childRow(sid, 'a2', '2026-10-07T01:00:00.000Z')]);
    subagent(sid, 'a1', 'SubagentStart'); subagent(sid, 'a2', 'SubagentStart');
    const found = await p.discoverChildren(parent);
    expect(found.children.map(c => c.identity.sessionId)).toEqual([`${sid}:a2`]);
    expect(found.gaps).toEqual(['binding_ancestry_unverified']);
    // A member whose first line is still being written is deferred without a gap.
    const next = randomUUID(); writeRoot(next); rmSync(join(receipts, 'connect'), { recursive: true }); connect(next);
    const nextParent = await currentIdentity(next, p);
    mkdirSync(join(projectDir, next, 'subagents'), { recursive: true }); writeFileSync(childPath(next, 'a3'), '{"type":"user","sessionId"', { mode: 0o600 });
    subagent(next, 'a3', 'SubagentStart');
    expect(await p.discoverChildren(nextParent)).toEqual({ children: [], gaps: [] });
  });

  it('resolves a skill call inside a subagent to the same identity discovery links', async () => {
    const sid = randomUUID(); writeRoot(sid); writeChild(sid, 'a1', [childRow(sid, 'a1', '2026-10-07T01:00:00.000Z')]);
    connect(sid); const p = provider(); const parent = await currentIdentity(sid, p);
    subagent(sid, 'a1', 'SubagentStart');
    const discovered = (await p.discoverChildren(parent)).children[0]!.identity;
    rmSync(join(receipts, 'connect'), { recursive: true });
    // The hook's transcript_path inside a subagent is undocumented; both forms resolve the member.
    connect(sid, { agent_id: 'a1', agent_type: 'general-purpose', transcript_path: childPath(sid, 'a1') });
    expect(locate(sid).role).toBe('child');
    expect(JSON.stringify(await currentIdentity(sid, p))).toBe(JSON.stringify(discovered));
  });

  it('forgets a deleted session so receipts cannot re-link it', async () => {
    const sid = randomUUID(); const kept = randomUUID(); writeRoot(sid); writeRoot(kept); writeChild(sid, 'a1', [childRow(sid, 'a1', '2026-10-07T01:00:00.000Z')]);
    connect(sid); connect(kept); const p = provider(); const parent = await currentIdentity(sid, p); const receipt = locate(sid).receipt!;
    subagent(sid, 'a1', 'SubagentStart');
    await p.forgetSession(sid);
    expect(await p.discoverChildren(parent)).toEqual({ children: [], gaps: [] });
    await expect(p.resolveCurrent({ receipt })).rejects.toThrow('claude_receipt_missing');
    expect((await currentIdentity(kept, p)).sessionId).toBe(kept);
  });
});

describe('Claude usage collection', () => {
  it('counts each request once across the family and excludes copies, conflicts and non-requests', async () => {
    const sid = randomUUID(); const foreign = randomUUID();
    writeRoot(sid, [
      assistant(sid, 'req_root1', [10, 20, 30, 5]), assistant(sid, 'req_root1', [10, 20, 30, 5], { timestamp: '2026-10-07T01:00:05.000Z' }),
      assistant(sid, 'req_child1', [1, 0, 0, 1], { isSidechain: true, agentId: 'a1' }),
      assistant(sid, 'req_err', [0, 0, 0, 0], {}, '<synthetic>'),
      assistant(sid, 'req_conflict', [1, 0, 0, 1]), assistant(sid, 'req_conflict', [1, 0, 0, 2]),
      assistant(foreign, 'req_foreign', [9, 9, 9, 9]),
      assistant(sid, 'req_newer', [1, 1, 1, 1], { version: '2.1.292' }),
      { ...assistant(sid, 'x', [1, 1, 1, 1]), requestId: undefined },
      userRow(sid, '2026-10-07T01:01:00.000Z'),
    ]);
    writeChild(sid, 'a1', [childRow(sid, 'a1', '2026-10-07T00:59:30.000Z'), assistant(sid, 'req_child1', [1, 2, 3, 4], { isSidechain: true, agentId: 'a1' }),
      assistant(sid, 'req_grandchild', [7, 7, 7, 7], { isSidechain: true, agentId: 'a9' })]);
    connect(sid); subagent(sid, 'a1', 'SubagentStart'); const p = provider();
    const parent = await currentIdentity(sid, p); const child = (await p.discoverChildren(parent)).children[0]!.identity;
    const scope = scopeFor([parent, child]);
    const rootBatch = await p.readUsage(parent, null, scope, { baseline: false }); const childBatch = await p.readUsage(child, null, scope, { baseline: false });
    expect(rootBatch.records).toHaveLength(1);
    expect(rootBatch.records[0]).toMatchObject({ requestId: 'req_root1', sessionId: sid, occurredAt: '2026-10-07T01:00:00.000Z', payload: {
      input_total: { value: 60 }, cached_input: { value: 30 }, output_total: { value: 5 }, reasoning_output: { status: 'unmeasurable' },
      model: 'claude-opus-5-5', product_version: '2.1.291', billing_components: [{ kind: 'ordinary_input', reading: { value: 10 } },
        { kind: 'cache_read', reading: { value: 30 } }, { kind: 'cache_write', reading: { value: 20 } }, { kind: 'output', reading: { value: 5 } }] } });
    expect(rootBatch.gaps).toEqual(['binding_usage_incomplete', 'incomplete_request', 'missing_usage', 'unsupported_history']);
    expect(childBatch.records.map(r => [r.requestId, r.sessionId])).toEqual([['req_child1', `${sid}:a1`]]);
    const family = [...rootBatch.records, ...childBatch.records];
    expect(new Set(ids(family)).size).toBe(family.length);
    expect(JSON.stringify([rootBatch, childBatch])).not.toContain(privateText);
  });

  it('emits a request written across polls once, with its first-row time', async () => {
    const sid = randomUUID(); writeRoot(sid, [assistant(sid, 'req_s', [1, 0, 0, 3])]); connect(sid);
    const parent = await currentIdentity(sid); const scope = scopeFor([parent]);
    const writing = provider({ now: Date.now });
    const first = await writing.readUsage(parent, null, scope, { baseline: false });
    expect(first.records).toEqual([]);
    appendFileSync(rootPath(sid), lines([assistant(sid, 'req_s', [1, 0, 0, 3], { timestamp: '2026-10-07T01:00:02.000Z' }), userRow(sid, '2026-10-07T01:00:03.000Z')]));
    const second = await writing.readUsage(parent, first.cursor, scope);
    expect(second.records.map(r => [r.requestId, r.occurredAt])).toEqual([['req_s', '2026-10-07T01:00:00.000Z']]);
    appendFileSync(rootPath(sid), lines([assistant(sid, 'req_s', [1, 0, 0, 3]), userRow(sid, '2026-10-07T01:00:04.000Z')]));
    const replay = await writing.readUsage(parent, second.cursor, scope);
    expect(replay).toMatchObject({ records: [], gaps: [] });
    appendFileSync(rootPath(sid), lines([assistant(sid, 'req_s', [1, 0, 0, 9]), userRow(sid, '2026-10-07T01:00:05.000Z')]));
    await expect(writing.readUsage(parent, replay.cursor, scope)).rejects.toThrow('binding_request_conflict');
  });

  it('excludes pre-observation usage at a baseline, including a response still being written', async () => {
    const sid = randomUUID();
    writeRoot(sid, [assistant(sid, 'req_old', [5, 0, 0, 5]), { type: 'system', subtype: 'compact_boundary', sessionId: sid }, assistant(sid, 'req_live', [1, 0, 0, 1])]);
    connect(sid); const parent = await currentIdentity(sid); const scope = scopeFor([parent]);
    const writing = provider({ now: Date.now });
    const baseline = await writing.readUsage(parent, null, scope, { baseline: true });
    expect(baseline).toMatchObject({ records: [], gaps: [] });
    appendFileSync(rootPath(sid), lines([assistant(sid, 'req_live', [1, 0, 0, 1]), userRow(sid, '2026-10-07T01:02:00.000Z'), assistant(sid, 'req_new', [2, 0, 0, 2]), userRow(sid, '2026-10-07T01:03:00.000Z')]));
    expect(ids((await writing.readUsage(parent, baseline.cursor, scope)).records)).toEqual(['req_new']);
  });

  it('retains incomplete baseline request IDs after the observed replay window rolls', async () => {
    const sid = randomUUID();
    const pending = assistant(sid, 'req_pending', [1, 0, 0, 1]);
    writeRoot(sid, [{...pending, message: {...pending.message, usage: undefined}}]); connect(sid);
    const p = provider(); const parent = await currentIdentity(sid, p); const scope = scopeFor([parent]);
    const baseline = await p.readUsage(parent, null, scope, { baseline: true });
    appendFileSync(rootPath(sid), lines(Array.from({length: 1025}, (_, i) => assistant(sid, `new_${i}`, [1, 0, 0, 1]))));
    const observed = await p.readUsage(parent, baseline.cursor, scope);
    expect(observed.records).toHaveLength(1025);
    appendFileSync(rootPath(sid), lines([assistant(sid, 'req_pending', [2, 0, 0, 3]), userRow(sid, '2026-10-07T01:10:00.000Z')]));
    expect((await p.readUsage(parent, observed.cursor, scope)).records).toEqual([]);
  });

  it('fails closed instead of forgetting an over-capacity or partial baseline', async () => {
    const sid = randomUUID();
    writeRoot(sid, Array.from({length: 1025}, (_, i) => assistant(sid, `prior_${i}`, [1, 0, 0, 1])));
    connect(sid); const p = provider(); const parent = await currentIdentity(sid, p); const scope = scopeFor([parent]);
    await expect(p.readUsage(parent, null, scope, { baseline: true })).rejects.toThrow('claude_baseline_limit');
    writeRoot(sid); const refreshed = await currentIdentity(sid, p);
    appendFileSync(rootPath(sid), '{"type":"assistant"');
    await expect(p.readUsage(refreshed, null, scopeFor([refreshed]), { baseline: true })).rejects.toThrow('claude_baseline_incomplete');
    rmSync(rootPath(sid));
    await expect(p.readUsage(refreshed, null, scopeFor([refreshed]), { baseline: true })).rejects.toThrow('claude_baseline_incomplete');
  });

  it('includes a fresh child from its first request, without a discovery-time filter', async () => {
    const sid = randomUUID(); writeRoot(sid); connect(sid); const p = provider(); const parent = await currentIdentity(sid, p);
    writeChild(sid, 'a1', [childRow(sid, 'a1', '2026-10-07T01:00:00.000Z'), assistant(sid, 'req_c1', [1, 0, 0, 1], { agentId: 'a1', isSidechain: true }),
      assistant(sid, 'req_c2', [2, 0, 0, 2], { agentId: 'a1', isSidechain: true, timestamp: '2026-10-07T01:00:30.000Z' }), childRow(sid, 'a1', '2026-10-07T01:00:40.000Z')]);
    subagent(sid, 'a1', 'SubagentStart');
    const child = (await p.discoverChildren(parent)).children[0]!.identity; const scope = scopeFor([parent, child]);
    expect(ids((await p.readUsage(child, null, scope, { baseline: false })).records)).toEqual(['req_c1', 'req_c2']);
    expect((await p.readUsage(child, null, scope, { baseline: true })).records).toEqual([]);
  });

  it('reads a null-cursor snapshot to the end even beyond one read window', async () => {
    const sid = randomUUID();
    writeRoot(sid, Array.from({ length: 40 }, (_, i) => [assistant(sid, `req_${i}`, [1, 0, 0, 1]), userRow(sid, '2026-10-07T01:00:00.000Z')]).flat());
    connect(sid); const p = provider({ maxReadBytes: 4096 }); const parent = await currentIdentity(sid, p); const scope = scopeFor([parent]);
    const snapshot = await p.readUsage(parent, null, scope, { baseline: false });
    expect(snapshot.records).toHaveLength(40);
    expect((await p.readUsage(parent, snapshot.cursor, scope)).records).toEqual([]);
  });

  it('continues from a cursor across collector restart and refuses replaced or unscoped sources', async () => {
    const sid = randomUUID(); writeRoot(sid, [assistant(sid, 'req_1', [1, 0, 0, 1])]); connect(sid);
    const parent = await currentIdentity(sid); const scope = scopeFor([parent]);
    const first = await provider().readUsage(parent, null, scope, { baseline: false });
    appendFileSync(rootPath(sid), lines([assistant(sid, 'req_2', [2, 0, 0, 2])]) + '{"type":"assistant","partial');
    const restarted = provider();
    const second = await restarted.readUsage(parent, first.cursor, scope);
    expect([first, second].map(batch => ids(batch.records))).toEqual([['req_1'], ['req_2']]);
    expect((await restarted.readUsage(parent, second.cursor, scope)).records).toEqual([]);
    truncateSync(rootPath(sid), 10);
    expect((await restarted.readUsage(parent, second.cursor, scope)).gaps).toEqual(['source_changed']);
    rmSync(rootPath(sid)); writeRoot(sid, [assistant(sid, 'req_3', [3, 0, 0, 3])]);
    expect(await restarted.readUsage(parent, second.cursor, scope)).toMatchObject({ records: [], gaps: ['source_changed'] });
    const other = randomUUID(); writeRoot(other); connect(other);
    rmSync(join(receipts, 'connect'), { recursive: true }); connect(other);
    const otherIdentity = await currentIdentity(other);
    await expect(restarted.readUsage(otherIdentity, null, scope)).rejects.toThrow('claude_scope_mismatch');
  });

  it('keeps a new parent session separate so the common layer can bind it to the same task', async () => {
    const first = randomUUID(); const next = randomUUID();
    writeRoot(first, [assistant(first, 'req_a', [1, 0, 0, 1])]); writeRoot(next, [assistant(next, 'req_b', [2, 0, 0, 2])]);
    connect(first); const a = await currentIdentity(first);
    rmSync(join(receipts, 'connect'), { recursive: true }); connect(next); const b = await currentIdentity(next);
    expect(a.sessionId).not.toBe(b.sessionId); expect(a.sourceIdentity).not.toBe(b.sourceIdentity);
    const scope = scopeFor([a, b]);
    expect(ids((await provider().readUsage(a, null, scope, { baseline: false })).records)).toEqual(['req_a']);
    expect(ids((await provider().readUsage(b, null, scope, { baseline: false })).records)).toEqual(['req_b']);
  });
});
