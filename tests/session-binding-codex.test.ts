import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { CodexSessionBindingProvider, proposeCodexSessionBindingHooks } from '../src/session-binding-codex.js';
import type { CandidateScope } from '../src/nested-candidate.js';

const cleanup: string[] = [];
afterEach(() => { for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const at = (s: number) => `2026-10-06T00:00:${String(s).padStart(2, '0')}Z`;
const jsonl = (rows: unknown[]) => rows.map(row => JSON.stringify(row)).join('\n') + '\n';
function fixture() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'binding-codex-synthetic-'))); cleanup.push(dir);
  const journal = join(dir, 'receipts'); mkdirSync(journal); chmodSync(journal, 0o700);
  let now = at(5);
  const provider = new CodexSessionBindingProvider({ receiptDirectory: journal, sourceRoots: [dir], projectRoot: dir, clock: () => now });
  const path = (id: string) => join(dir, `${id}.jsonl`);
  const meta = (id: string, parent: string | null = null, depth = 0, extra = {}) => ({ type: 'session_meta', timestamp: at(0), payload: {
    id, session_id: 'root', parent_thread_id: parent, cli_version: '0.160.0', cwd: dir,
    source: parent ? { subagent: { thread_spawn: { parent_thread_id: parent, depth } } } : 'cli', ...extra,
  } });
  const context = (id = 'root', seconds = 6) => ({ type: 'turn_context', timestamp: at(seconds), payload: {
    cwd: dir, turn_id: id === 'root' ? 'turn' : `${id}-turn`, root_turn_id: 'turn', model: 'synthetic-model', effort: 'high',
  } });
  const usage = (id = 'root', requestId: string = randomUUID(), seconds = 7) => ({ type: 'token_usage_record', timestamp: at(seconds), payload: {
    thread_id: id, session_id: 'root', turn_id: id === 'root' ? 'turn' : `${id}-turn`, root_turn_id: 'turn', response_id: requestId,
    usage: { input_tokens: 100, cached_input_tokens: 10, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 120 },
  } });
  function receipt(id: string, parent: string | null = null) {
    const input = { hook_event_name: parent ? 'SubagentStart' : 'SessionStart', session_id: parent ? 'root' : id,
      agent_id: parent ? id : undefined, turn_id: parent ? `${id}-turn` : undefined, transcript_path: path(id), cwd: dir,
      source: parent ? undefined : 'startup', permission_mode: 'default', model: 'synthetic-model', agent_type: 'synthetic',
      prompt: 'PRIVATE_SYNTHETIC_SENTINEL', env: { secret: 'PRIVATE_SYNTHETIC_SENTINEL' } };
    const result = JSON.parse(execFileSync(process.execPath, [resolve('scripts/session-binding-codex-hook.mjs'), '--receipt-directory', journal,
      '--source-root', dir], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CODEX_THREAD_ID: 'false-thread' } })) as { hookSpecificOutput: { additionalContext: string } };
    return /[0-9a-f-]{36}/.exec(result.hookSpecificOutput.additionalContext)![0];
  }
  const scope = (ids: { id: string; parent: string | null }[]): CandidateScope => ({ projectId: 'project', taskId: 'task', allowedRootTurnIds: ['turn'],
    sessions: ids.map(s => ({ sessionId: s.id, sourceId: s.id, nativeSessionId: s.id, rootSessionId: 'root', parentSessionId: s.parent,
      product: 'codex', processId: null, agentId: null })) });
  const write = (id: string, rows: unknown[]) => writeFileSync(path(id), jsonl(rows));
  write('root', [meta('root')]);
  return { dir, journal, provider, path, meta, context, usage, receipt, scope, write, set: (s: number) => { now = at(s); } };
}

test('native receipt is the identity proof and producer retains only allowlisted metadata without reading transcript', async () => {
  const f = fixture(); writeFileSync(f.path('root'), 'NOT A TRANSCRIPT');
  const receipt = f.receipt('root'); const identity = await f.provider.resolveCurrent({ receipt });
  expect(identity).toMatchObject({ sessionId: 'root', parentSessionId: null, productVersion: '0.160.0' });
  expect(readFileSync(join(f.journal, `${receipt}.json`), 'utf8')).not.toContain('PRIVATE_SYNTHETIC_SENTINEL');
  expect(f.provider.capabilities()).toMatchObject({ productionSupported: false, currentIdentity: 'native_hook' });
  await expect(f.provider.resolveCurrent({ receipt: randomUUID() })).rejects.toThrow('binding_identity_unavailable');
});

test('discovers multiple direct children and an independently verified grandchild, while missing/ambiguous ancestry fails closed', async () => {
  const f = fixture(); const root = await f.provider.resolveCurrent({ receipt: f.receipt('root') });
  for (const id of ['a', 'b']) { f.write(id, [f.meta(id, 'root', 1)]); f.receipt(id, 'root'); }
  f.write('grandchild', [f.meta('grandchild', 'a', 2)]); f.receipt('grandchild', 'a');
  f.write('wrong', [f.meta('wrong', 'foreign', 1)]); f.receipt('wrong', 'root');
  const children = await f.provider.discoverChildren(root);
  expect(children.children.map(c => c.identity.sessionId).sort()).toEqual(['a', 'b']);
  expect(children.gaps).toContain('binding_ancestry_unverified');
  const a = children.children.find(c => c.identity.sessionId === 'a')!.identity;
  expect((await f.provider.discoverChildren(a)).children.map(c => c.identity.sessionId)).toEqual(['grandchild']);
});

test('usage baselines exclude existing requests and old contexts, deduplicate replays, preserve native runtime and counters', async () => {
  const f = fixture(); f.write('root', [f.meta('root'), f.context('root', 1), f.usage('root', 'old', 2)]);
  const session = await f.provider.resolveCurrent({ receipt: f.receipt('root') }); const scope = f.scope([{ id: 'root', parent: null }]);
  const baseline = await f.provider.readUsage(session, null, scope); expect(baseline.records.map(r => r.requestId)).toEqual(['old']);
  appendFileSync(f.path('root'), jsonl([f.usage('root', 'old-context'), f.context(), f.usage('root', 'own')])); f.set(8);
  const batch = await f.provider.readUsage(session, baseline.cursor, scope);
  expect(batch.records.map(r => r.requestId)).toEqual(['own']);
  expect(batch.records[0]).toMatchObject({ turnId: 'turn', effort: 'high', payload: { model: 'synthetic-model', input_total: { value: 100 }, output_total: { value: 20 } } });
  appendFileSync(f.path('root'), jsonl([f.usage('root', 'own')]));
  expect((await f.provider.readUsage(session, batch.cursor, scope)).records).toEqual([]);
  expect(JSON.stringify(batch)).not.toContain('NOT A TRANSCRIPT');
});

test('invalid scope is rejected before reading, and source rewrite/rotation/cursor tamper fail closed', async () => {
  const f = fixture(); const session = await f.provider.resolveCurrent({ receipt: f.receipt('root') }); const scope = f.scope([{ id: 'root', parent: null }]);
  const baseline = await f.provider.readUsage(session, null, scope);
  await expect(f.provider.readUsage(session, baseline.cursor, f.scope([{ id: 'other', parent: null }]))).rejects.toThrow('binding_scope_mismatch');
  await expect(f.provider.readUsage(session, baseline.cursor + 'x', scope)).rejects.toThrow('binding_cursor_invalid');
  f.write('root', [f.meta('root', null, 0, { extra: 'changed' }), f.context(), f.usage()]);
  await expect(f.provider.readUsage(session, baseline.cursor, scope)).rejects.toThrow('binding_source_changed');
  renameSync(f.path('root'), f.path('previous')); f.write('root', [f.meta('root')]);
  await expect(f.provider.readUsage(session, null, scope)).rejects.toThrow('binding_source_changed');
});

test('a discovered sibling does not invalidate a root cursor, and provider restart establishes a new baseline', async () => {
  const f = fixture(); const session = await f.provider.resolveCurrent({ receipt: f.receipt('root') });
  const baseline = await f.provider.readUsage(session, null, f.scope([{ id: 'root', parent: null }]));
  f.write('child', [f.meta('child', 'root', 1)]); f.receipt('child', 'root');
  appendFileSync(f.path('root'), jsonl([f.context(), f.usage('root', 'after-family-growth')])); f.set(8);
  const grown = f.scope([{ id: 'root', parent: null }, { id: 'child', parent: 'root' }]);
  expect((await f.provider.readUsage(session, baseline.cursor, grown)).records.map(r => r.requestId)).toEqual(['after-family-growth']);
  const restarted = new CodexSessionBindingProvider({ receiptDirectory: f.journal, sourceRoots: [f.dir], projectRoot: f.dir, clock: () => at(8) });
  await expect(restarted.readUsage(session, baseline.cursor, grown)).rejects.toThrow('binding_cursor_invalid');
  expect((await restarted.readUsage(session, null, grown)).records.map(r => r.requestId)).toEqual(['after-family-growth']);
});

test('paginated child own suffix excludes inherited requests and cumulative token mirrors', async () => {
  const f = fixture(); const root = await f.provider.resolveCurrent({ receipt: f.receipt('root') });
  const meta = { ...f.meta('child', 'root', 1, { history_mode: 'paginated', forked_from_id: 'root', forked_from_ordinal_exclusive: 20,
    subagent_history_start_ordinal: 23, history_base: { thread_id: 'root', end_ordinal_exclusive: 20, end_byte_offset: 123 } }), ordinal: 20 };
  f.write('child', [meta, { ...f.context('root', 1), ordinal: 21 }, { ...f.usage('root', 'inherited', 2), ordinal: 22 }]); f.receipt('child', 'root');
  const child = (await f.provider.discoverChildren(root)).children[0]!.identity;
  const scope = f.scope([{ id: 'root', parent: null }, { id: 'child', parent: 'root' }]);
  const baseline = await f.provider.readUsage(child, null, scope);
  appendFileSync(f.path('child'), jsonl([{ ...f.context('child'), ordinal: 23 }, { ...f.usage('child', 'own-child'), ordinal: 24 },
    { type: 'event_msg', ordinal: 25, payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 999999 } } } }])); f.set(8);
  const batch = await f.provider.readUsage(child, baseline.cursor, scope);
  expect(batch.records.map(r => r.requestId)).toEqual(['own-child']);
  expect(batch.records[0]!.payload.cached_input.value).toBe(10);
  expect(batch.records[0]!.payload.reasoning_output.value).toBe(5);
});

test('partial trailing response waits for completion and malformed counters/native request conflicts fail closed', async () => {
  const f = fixture(); const session = await f.provider.resolveCurrent({ receipt: f.receipt('root') }); const scope = f.scope([{ id: 'root', parent: null }]);
  const baseline = await f.provider.readUsage(session, null, scope);
  appendFileSync(f.path('root'), jsonl([f.context()])); const response = f.usage('root', 'partial');
  appendFileSync(f.path('root'), JSON.stringify(response)); f.set(8);
  const partial = await f.provider.readUsage(session, baseline.cursor, scope); expect(partial.records).toEqual([]); expect(partial.gaps).toContain('binding_partial_usage');
  appendFileSync(f.path('root'), '\n'); const complete = await f.provider.readUsage(session, partial.cursor, scope); expect(complete.records).toHaveLength(1);
  const conflict = f.usage('root', 'partial'); conflict.payload.usage.input_tokens = 101; conflict.payload.usage.total_tokens = 121;
  appendFileSync(f.path('root'), jsonl([conflict]));
  await expect(f.provider.readUsage(session, complete.cursor, scope)).rejects.toThrow('candidate_conflict');
  f.write('root', [f.meta('root'), f.context(), f.usage('root', 'invalid')]);
  const invalid = f.usage('root', 'invalid'); invalid.payload.usage.total_tokens = 119;
  f.write('root', [f.meta('root'), f.context(), invalid]);
  await expect(f.provider.readUsage(session, null, scope)).rejects.toThrow('candidate_invalid_metadata');
});

test('missing child hooks, malformed ancestry, private metadata permissions and symlink sources never enable discovery', async () => {
  const f = fixture(); const root = await f.provider.resolveCurrent({ receipt: f.receipt('root') });
  f.write('unhooked', [f.meta('unhooked', 'root', 1)]);
  expect((await f.provider.discoverChildren(root)).children).toEqual([]);
  f.write('a', [f.meta('a', 'root', 1)]); f.receipt('a', 'root');
  f.write('grandchild', [f.meta('grandchild', 'a', 2)]); const grandReceipt = f.receipt('grandchild', 'a');
  f.write('a', [f.meta('a', 'foreign', 1)]);
  await expect(f.provider.resolveCurrent({ receipt: grandReceipt })).rejects.toThrow('binding_ancestry_unverified');
  renameSync(f.path('root'), f.path('target')); symlinkSync(f.path('target'), f.path('root'));
  expect(() => f.receipt('root')).toThrow();
  chmodSync(f.journal, 0o755);
  await expect(f.provider.resolveCurrent({ receipt: root.identityEvidenceId })).rejects.toThrow('binding_identity_unavailable');
});

test('resource limits are explicit and prevent unsupported transcript processing', async () => {
  const f = fixture(); const session = await f.provider.resolveCurrent({ receipt: f.receipt('root') });
  const limited = new CodexSessionBindingProvider({ receiptDirectory: f.journal, sourceRoots: [f.dir], projectRoot: f.dir,
    clock: () => at(5), maxSourceBytes: 10 });
  await expect(limited.readUsage(session, null, f.scope([{ id: 'root', parent: null }]))).rejects.toThrow('binding_source_limit');
  expect(limited.capabilities().reasons).toContain('binding_source_byte_limit_10');
});

test('hook proposal is reviewable project configuration with shell-safe explicit paths and no installation', () => {
  const f = fixture();
  const proposal = proposeCodexSessionBindingHooks({ receiptDirectory: f.journal, sourceRoots: [f.dir], projectRoot: f.dir,
    nodeExecutable: '/synthetic/node', scriptPath: "/synthetic/hook's producer.mjs" });
  expect(proposal.destination).toBe(join(f.dir, '.codex', 'hooks.json'));
  expect(proposal.configuration.hooks.SessionStart[0]!.matcher).toBe('startup|resume|clear|compact');
  expect(proposal.configuration.hooks.SubagentStart[0]!.hooks[0]!.command).toContain("'\"'\"'");
  expect(proposal.productionSupported).toBe(false);
  expect(proposal.requirements).toContain('exact_native_hook_path_and_header_conformance_required');
});

test('multiple siblings and a grandchild project their own requests with exact native depth and global IDs', async () => {
  const f = fixture(); const root = await f.provider.resolveCurrent({ receipt: f.receipt('root') });
  for (const id of ['a', 'b']) { f.write(id, [f.meta(id, 'root', 1)]); f.receipt(id, 'root'); }
  f.write('grandchild', [f.meta('grandchild', 'a', 2)]); f.receipt('grandchild', 'a');
  const children = (await f.provider.discoverChildren(root)).children;
  const a = children.find(c => c.identity.sessionId === 'a')!.identity;
  const grandchild = (await f.provider.discoverChildren(a)).children[0]!.identity;
  const scope = f.scope([{ id: 'root', parent: null }, { id: 'a', parent: 'root' }, { id: 'b', parent: 'root' }, { id: 'grandchild', parent: 'a' }]);
  const identities = [...children.map(c => c.identity), grandchild];
  const cursors = await Promise.all(identities.map(s => f.provider.readUsage(s, null, scope)));
  for (const s of identities) appendFileSync(f.path(s.sessionId), jsonl([f.context(s.sessionId), f.usage(s.sessionId, `${s.sessionId}-global-request`)]));
  f.set(8);
  const batches = await Promise.all(identities.map((s, i) => f.provider.readUsage(s, cursors[i]!.cursor, scope)));
  expect(batches.flatMap(b => b.records.map(r => r.requestId)).sort()).toEqual(['a-global-request', 'b-global-request', 'grandchild-global-request']);
});

test('paginated inherited grandchild history remains an explicit unsupported gap', async () => {
  const f = fixture(); const root = await f.provider.resolveCurrent({ receipt: f.receipt('root') });
  f.write('a', [f.meta('a', 'root', 1)]); f.receipt('a', 'root');
  const a = (await f.provider.discoverChildren(root)).children[0]!.identity;
  f.write('grandchild', [{ ...f.meta('grandchild', 'a', 2, { history_mode: 'paginated', forked_from_id: 'a', forked_from_ordinal_exclusive: 20,
    subagent_history_start_ordinal: 21, history_base: { thread_id: 'a', end_ordinal_exclusive: 20, end_byte_offset: 123 } }), ordinal: 20 }]);
  f.receipt('grandchild', 'a'); const grandchild = (await f.provider.discoverChildren(a)).children[0]!.identity;
  const scope = f.scope([{ id: 'root', parent: null }, { id: 'a', parent: 'root' }, { id: 'grandchild', parent: 'a' }]);
  const batch = await f.provider.readUsage(grandchild, null, scope);
  expect(batch.records).toEqual([]); expect(batch.gaps).toEqual(['candidate_unsupported_history']);
});

test('initial child snapshot returns first own responses for coordinator selection and excludes ancestor copies', async () => {
  const f = fixture(); const root = await f.provider.resolveCurrent({ receipt: f.receipt('root') });
  f.write('child', [f.meta('child', 'root', 1), f.context('root'), f.usage('root', 'inherited'), f.context('child'), f.usage('child', 'child-first')]); f.receipt('child', 'root');
  const child = (await f.provider.discoverChildren(root)).children[0]!.identity; f.set(8);
  const scope = f.scope([{ id: 'root', parent: null }, { id: 'child', parent: 'root' }]);
  const initial = await f.provider.readUsage(child, null, scope);
  expect(initial.records.map(r => r.requestId)).toEqual(['child-first']);
  expect((await f.provider.readUsage(child, initial.cursor, scope)).records).toEqual([]);
});

test('renewed same-source hook receipts preserve identity, while unrelated absent sources do not block family discovery', async () => {
  const f = fixture(); const firstReceipt = f.receipt('root'); const root = await f.provider.resolveCurrent({ receipt: firstReceipt });
  const renewed = await f.provider.resolveCurrent({ receipt: f.receipt('root') }); expect(renewed).toEqual(root);
  f.write('unrelated', [f.meta('unrelated')]); f.receipt('unrelated'); rmSync(f.path('unrelated'));
  f.write('child', [f.meta('child', 'root', 1)]); f.receipt('child', 'root');
  expect((await f.provider.discoverChildren(root)).children.map(c => c.identity.sessionId)).toEqual(['child']);
});

test('missing native context or usage remains a recoverable explicit gap', async () => {
  const f = fixture(); f.write('root', [f.meta('root'), f.usage('root', 'without-context')]); f.set(8);
  const root = await f.provider.resolveCurrent({ receipt: f.receipt('root') }); const scope = f.scope([{ id: 'root', parent: null }]);
  expect(await f.provider.readUsage(root, null, scope)).toMatchObject({ records: [], gaps: ['binding_partial_usage'] });
  const missing = f.usage('root', 'without-usage');
  f.write('root', [f.meta('root'), f.context(), { ...missing, payload: { ...missing.payload, usage: null } }]);
  expect(await f.provider.readUsage(root, null, scope)).toMatchObject({ records: [], gaps: ['binding_partial_usage'] });
});

test('malformed or missing native source metadata returns sanitized reasons without transcript text or private paths', async () => {
  const f = fixture(); f.receipt('root'); f.write('child', [f.meta('child', 'root', 1)]); const receipt = f.receipt('child', 'root');
  writeFileSync(f.path('child'), 'PRIVATE_SYNTHETIC_SENTINEL\n');
  await expect(f.provider.resolveCurrent({ receipt })).rejects.toThrow('binding_ancestry_unverified');
  rmSync(f.path('child'));
  await expect(f.provider.resolveCurrent({ receipt })).rejects.toThrow('binding_source_unavailable');
});

test('root native header independently validates identity and version before transcript body parsing', async () => {
  const f = fixture(); const root = await f.provider.resolveCurrent({ receipt: f.receipt('root') });
  f.write('root', [f.meta('foreign')]); appendFileSync(f.path('root'), 'PRIVATE_SYNTHETIC_SENTINEL\n');
  await expect(f.provider.readUsage(root, null, f.scope([{ id: 'root', parent: null }]))).rejects.toThrow('binding_scope_mismatch');
});

test('fresh child continuation retains its earlier own context while restart baselines exclude it', async () => {
  const f = fixture(); const root = await f.provider.resolveCurrent({ receipt: f.receipt('root') });
  f.write('child', [f.meta('child', 'root', 1), f.context('child', 6), f.usage('child', 'first', 7)]); f.receipt('child', 'root');
  const child = (await f.provider.discoverChildren(root)).children[0]!.identity;
  const scope = f.scope([{ id: 'root', parent: null }, { id: 'child', parent: 'root' }]); f.set(8);
  const initial = await f.provider.readUsage(child, null, scope, { baseline: false });
  expect(initial.records.map(r => r.requestId)).toEqual(['first']);
  appendFileSync(f.path('child'), jsonl([f.usage('child', 'second', 9)])); f.set(10);
  const continuation = await f.provider.readUsage(child, initial.cursor, scope);
  expect(continuation.records.map(r => r.requestId)).toEqual(['second']);
  let restartedNow = at(10);
  const restarted = new CodexSessionBindingProvider({ receiptDirectory: f.journal, sourceRoots: [f.dir], projectRoot: f.dir, clock: () => restartedNow });
  const baseline = await restarted.readUsage(child, null, scope, { baseline: true });
  appendFileSync(f.path('child'), jsonl([f.usage('child', 'old-context-after-restart', 11)]));
  restartedNow = at(12);
  const afterRestart = await restarted.readUsage(child, baseline.cursor, scope);
  expect(afterRestart.records).toEqual([]); expect(afterRestart.gaps).not.toContain('binding_future_usage');
  expect(afterRestart.gaps).toContain('binding_unobserved_context');
});

test('same-timestamp lower UUID renewal cannot replace durable source evidence across provider restart', async () => {
  const f = fixture(); const first = f.receipt('root');
  const lower = '00000000-0000-4000-8000-000000000001'; const higher = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const metadata = JSON.parse(readFileSync(join(f.journal, `${first}.json`), 'utf8')) as Record<string, unknown>;
  rmSync(join(f.journal, `${first}.json`));
  writeFileSync(join(f.journal, `${higher}.json`), JSON.stringify({ ...metadata, receipt: higher }), { mode: 0o600 });
  const original = await f.provider.resolveCurrent({ receipt: higher });
  writeFileSync(join(f.journal, `${lower}.json`), JSON.stringify({ ...metadata, receipt: lower }), { mode: 0o600 });
  expect(await f.provider.resolveCurrent({ receipt: lower })).toEqual(original);
  const restarted = new CodexSessionBindingProvider({ receiptDirectory: f.journal, sourceRoots: [f.dir], projectRoot: f.dir });
  expect(await restarted.resolveCurrent({ receipt: lower })).toEqual(original);
  expect((await restarted.discoverChildren(original)).children).toEqual([]);
  const conflicting = randomUUID();
  writeFileSync(join(f.journal, `${conflicting}.json`), JSON.stringify({ ...metadata, receipt: conflicting, sourceIdentity: '1:2' }), { mode: 0o600 });
  await expect(restarted.resolveCurrent({ receipt: lower })).rejects.toThrow('binding_identity_ambiguous');
  await expect(restarted.discoverChildren(original)).rejects.toThrow('binding_identity_ambiguous');
});

test('native shared-root hook cannot substitute the parent transcript or trigger a guessed child path scan', async () => {
  const f = fixture(); const root = await f.provider.resolveCurrent({receipt: f.receipt('root')});
  f.write('child', [f.meta('child', 'root', 1), f.context('child'), f.usage('child')]);
  execFileSync(process.execPath, [resolve('scripts/session-binding-codex-hook.mjs'), '--receipt-directory', f.journal, '--source-root', f.dir], {
    input: JSON.stringify({hook_event_name: 'SubagentStart', session_id: 'root', agent_id: 'child', turn_id: 'child-turn',
      transcript_path: f.path('root'), cwd: f.dir, model: 'synthetic-model', agent_type: 'synthetic', permission_mode: 'default'}), encoding: 'utf8',
  });
  const found = await f.provider.discoverChildren(root);
  expect(found.children).toEqual([]); expect(found.gaps).toContain('binding_ancestry_unverified');
  // A correct file exists nearby, but only the native hook's exact path is allowed.
  expect(readFileSync(f.path('child'), 'utf8')).toContain('token_usage_record');
});


test('legacy canonical child receipts survive native renewal and discover shared-root grandchildren', async () => {
  const f = fixture(); await f.provider.resolveCurrent({ receipt: f.receipt('root') });
  f.write('child', [f.meta('child', 'root', 1)]); const oldReceipt = f.receipt('child', 'root');
  const oldPath = join(f.journal, `${oldReceipt}.json`);
  const legacy = JSON.parse(readFileSync(oldPath, 'utf8')) as Record<string, unknown>;
  delete legacy.nativeRootSessionId; legacy.parentSessionId = 'root';
  writeFileSync(oldPath, JSON.stringify(legacy));
  const child = await f.provider.resolveCurrent({ receipt: oldReceipt });
  const renewed = await f.provider.resolveCurrent({ receipt: f.receipt('child', 'root') });
  expect(renewed).toEqual(child);
  f.write('grandchild', [f.meta('grandchild', 'child', 2)]); f.receipt('grandchild', 'child');
  expect((await f.provider.discoverChildren(child)).children.map(c => c.identity.sessionId)).toEqual(['grandchild']);
});

test('qualification family ceiling rejects a fourth hook source before reading any new child envelope',async()=>{
 const f=fixture();const options={receiptDirectory:f.journal,sourceRoots:[f.dir],projectRoot:f.dir,clock:()=>at(5),maxFamilyMembers:3};
 const bounded=new CodexSessionBindingProvider(options);const parent=await bounded.resolveCurrent({receipt:f.receipt('root')});
 for(const id of['child-a','child-b']){f.write(id,[f.meta(id,'root',1)]);f.receipt(id,'root');}
 writeFileSync(f.path('extra'),'INVALID_EXTRA_HEADER');f.receipt('extra','root');
 expect(await bounded.discoverChildren(parent)).toEqual({children:[],gaps:['binding_family_limit']});
});


test('three-source ceiling rejects a renewed child receipt naming a fourth source before opening its header',async()=>{
 const f=fixture();const bounded=new CodexSessionBindingProvider({receiptDirectory:f.journal,sourceRoots:[f.dir],projectRoot:f.dir,maxFamilyMembers:3});
 const root=await bounded.resolveCurrent({receipt:f.receipt('root')});
 for(const id of ['a','b']){f.write(id,[f.meta(id,'root',1)]);f.receipt(id,'root');}
 expect((await bounded.discoverChildren(root)).children).toHaveLength(2);
 f.write('extra',[]);const receipt=f.receipt('a','root');const file=join(f.journal,receipt+'.json');const metadata=JSON.parse(readFileSync(file,'utf8')) as Record<string,unknown>;
 const stat=statSync(f.path('extra'));writeFileSync(file,JSON.stringify({...metadata,sourceRef:f.path('extra'),sourceIdentity:`${stat.dev}:${stat.ino}`}));
 expect(await bounded.discoverChildren(root)).toEqual({children:[],gaps:['binding_family_limit']});
});

test('bounded connect rejects another family child or root from hook metadata before any source header',()=>{
 const f=fixture();const provider=new CodexSessionBindingProvider({receiptDirectory:f.journal,sourceRoots:[f.dir],projectRoot:f.dir,maxFamilyMembers:3});
 const rootReceipt=f.receipt('root');expect(()=>provider.assertRootReceipt({receipt:rootReceipt},null)).not.toThrow();
 writeFileSync(f.path('other-root'),'INVALID_HEADER');const otherRoot=f.receipt('other-root');
 writeFileSync(f.path('other-child'),'INVALID_HEADER');const child=f.receipt('other-child','other-root');
 expect(()=>provider.assertRootReceipt({receipt:child},'root')).toThrow('binding_qualification_live_root_required');
 expect(()=>provider.assertRootReceipt({receipt:otherRoot},'root')).toThrow('binding_qualification_live_root_required');
 expect(()=>provider.assertRootReceipt({receipt:f.receipt('root')},'root')).not.toThrow();
});
