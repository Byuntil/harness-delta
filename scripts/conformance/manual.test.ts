import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { admissionCatalog, traverseCatalog } from './catalog.js';
import { confirmationPlan } from './confirm.js';
import { createInvestigation, runInvestigation } from './investigate.js';
import { parseCandidate, type CandidateInspection } from './parse-candidate.js';
import { codex01580Candidate } from './candidate.js';
import { main } from './runner.js';

const sessionId = '11112222-3333-4444-5555-666677778888';
const rollout = `rollout-2026-01-01T00-00-00-${sessionId}.jsonl`;
const inspection: CandidateInspection = {
  continuityKey: null, records: [], counters: null, counterAt: null, model: null,
  reasons: ['incomplete'], blocked: false,
  vectors: { total: null, last: null, exec: null, priorTotal: null },
  topology: {
    taskStartedTurnId: null, taskCompleteTurnId: null, turnId: null, rootTurnId: null,
    collaborationModePresent: false, multiAgentVersionPresent: false, threadSettingsApplied: 'absent',
    sessionMetaId: null, sessionMetaSessionId: null, linkedSessionId: sessionId,
    pairs: [], turnContexts: [],
  },
  traversal: traverseCatalog([], admissionCatalog),
};

test('the manual entry refuses a live run and does not spawn a product', () => {
  expect(() => main()).toThrow(/^live_run_not_approved$/);
  const runner = readFileSync(new URL('./runner.ts', import.meta.url), 'utf8');
  expect(runner).not.toContain('child_process');
  expect(runner).not.toContain('spawn(');
  expect(runner).not.toContain('dangerously-bypass-hook-trust');
  const source = readFileSync(new URL('./investigate.ts', import.meta.url), 'utf8');
  expect(source).not.toContain('linkSession');
  expect(source).not.toContain('parseSnapshot');
  expect(source).not.toContain('Collector');
  expect(source).not.toContain("from '../../src/store.js'");
});

test('synthetic investigation stops without opening files or writing events', () => {
  const mapping = createInvestigation({
    projectId: 'p1', taskId: 't1', processId: 'proc', sessionId, sourcePath: `/synthetic/${sessionId}.jsonl`,
    product: 'codex',
  });
  const plan = confirmationPlan(['synthetic']);
  const openFile = () => { throw new Error('opened'); };
  const writeEvent = () => { throw new Error('wrote'); };
  expect(runInvestigation({
    mapping, plan, names: [rollout, `rollout-later-${sessionId}.jsonl`], channel: { start: () => inspection }, openFile, writeEvent,
  })).toEqual({ status: 'stopped' });
  expect(runInvestigation({
    mapping, plan, names: [], channel: { start: () => inspection }, openFile, writeEvent,
  })).toEqual({ status: 'stopped' });
  expect(runInvestigation({
    mapping, plan, names: [rollout], channel: { start: () => 'refused' }, openFile, writeEvent, pauseOrRotation: true,
  })).toEqual({ status: 'stopped' });
  const reported = runInvestigation({
    mapping, plan, names: [rollout], channel: { start: () => inspection }, openFile, writeEvent,
  });
  expect(reported.status).toBe('report');
  if (reported.status === 'report') expect(reported.report.version).toBe('0.158.0');
});

test('paired and mismatched turn ids change the conformance report', () => {
  const scope = { sessionId: 'sessA', projectRoot: '/synthetic', product: 'codex' as const, version: '0.158.0' };
  const header = { type: 'session_meta', payload: { id: 'sessA', cwd: '/synthetic', cli_version: '0.158.0', source: 'exec' } };
  const lines = (...rows: unknown[]) => `${[header, ...rows].map(row => JSON.stringify(row)).join('\n')}\n`;
  const started = (id: string) => ({ timestamp: '2026-01-01T00:00:01Z', type: 'event_msg', payload: { type: 'task_started', turn_id: id } });
  const finished = (id: string) => ({ timestamp: '2026-01-01T00:00:02Z', type: 'event_msg', payload: { type: 'task_complete', turn_id: id } });
  const mapping = createInvestigation({
    projectId: 'p1', taskId: 't1', processId: 'proc', sessionId, sourcePath: `/synthetic/${sessionId}.jsonl`,
    product: 'codex',
  });
  const plan = confirmationPlan(['synthetic']);
  const name = rollout;
  const run = (body: string, extra: Partial<CandidateInspection['vectors']> = {}) => {
    const parsed = parseCandidate(body, scope, codex01580Candidate);
    return runInvestigation({
      mapping, plan, names: [name],
      channel: { start: () => ({ ...parsed, vectors: { ...parsed.vectors, ...extra } }) },
    });
  };
  const paired = run(lines(started('turnAlpha'), finished('turnAlpha')));
  expect(paired.status).toBe('report');
  if (paired.status === 'report') {
    expect(paired.report.checks.paired_turn_ids).toBe('pass');
    expect(paired.report.blocked).toBe(false);
    expect(paired.report.matchedPaths).toContain('event_msg.task_started.turn_id');
    expect(JSON.stringify(paired.report)).not.toContain('turnAlpha');
  }
  const mismatched = run(lines(started('turnAlpha'), finished('turnBeta')));
  expect(mismatched.status).toBe('report');
  if (mismatched.status === 'report') {
    expect(mismatched.report.checks.paired_turn_ids).toBe('fail');
    expect(mismatched.report.blocked).toBe(true);
    expect(JSON.stringify(mismatched.report)).not.toContain('turnBeta');
  }
  const counted = parseCandidate(lines(
    { type: 'turn_context', payload: { model: 'synthetic' } },
    { timestamp: '2026-01-01T00:00:01Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: {
      input_tokens: 10, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, cache_write_input_tokens: 0,
    } } } },
  ), scope, codex01580Candidate);
  const prior = { input: 4, cached: 0, output: 1, reasoning: 0, cacheWrite: 0, totalTokens: null };
  const last = { input: 6, cached: 0, output: 0, reasoning: 0, cacheWrite: 0, totalTokens: null };
  const agreed = runInvestigation({
    mapping, plan, names: [name],
    channel: { start: () => ({ ...counted, vectors: { ...counted.vectors, exec: counted.vectors.total, priorTotal: prior, last } }) },
  });
  expect(agreed.status).toBe('report');
  if (agreed.status === 'report') {
    expect(agreed.report.checks.exec_equals_rollout_total).toBe('pass');
    expect(agreed.report.checks.resume_total_equals_prior_plus_last).toBe('pass');
  }
  const maskedPairs = run(lines(
    started('mask-a'), finished('mask-b'), started('mask-c'), finished('mask-c'),
  ));
  expect(maskedPairs.status).toBe('report');
  if (maskedPairs.status === 'report') {
    expect(maskedPairs.report.checks.paired_turn_ids).toBe('fail');
    expect(JSON.stringify(maskedPairs.report)).not.toContain('mask-a');
    expect(JSON.stringify(maskedPairs.report)).not.toContain('mask-c');
  }
  const context = (turn: string, root?: string) => ({
    type: 'turn_context', payload: { model: 'synthetic', turn_id: turn, ...(root === undefined ? {} : { root_turn_id: root }) },
  });
  const maskedRoots = run(lines(context('root-a', 'other-root'), context('root-b', 'root-b')));
  expect(maskedRoots.status).toBe('report');
  if (maskedRoots.status === 'report') {
    expect(maskedRoots.report.checks.root_turn_topology).toBe('fail');
    expect(JSON.stringify(maskedRoots.report)).not.toContain('other-root');
    expect(JSON.stringify(maskedRoots.report)).not.toContain('root-b');
  }
  const missingRoot = run(lines(context('root-a', 'root-a'), context('root-later')));
  expect(missingRoot.status).toBe('report');
  if (missingRoot.status === 'report') {
    expect(missingRoot.report.checks.root_turn_topology).toBe('pass');
    expect(JSON.stringify(missingRoot.report)).not.toContain('root-later');
  }
  const nonStringRoot = run(lines(
    { type: 'turn_context', payload: { model: 'synthetic', turn_id: 'root-a', root_turn_id: 909091 } },
    context('root-b', 'root-b'),
  ));
  expect(nonStringRoot.status).toBe('report');
  if (nonStringRoot.status === 'report') {
    expect(nonStringRoot.report.checks.root_turn_topology).toBe('invalid');
    expect(nonStringRoot.report.blocked).toBe(true);
    expect(JSON.stringify(nonStringRoot.report)).not.toContain('909091');
  }
  const drifted = runInvestigation({
    mapping, plan, names: [name],
    channel: { start: () => ({ ...counted, vectors: { ...counted.vectors, exec: { ...counted.vectors.total!, input: 99 } } }) },
  });
  expect(drifted.status).toBe('report');
  if (drifted.status === 'report') {
    expect(drifted.report.checks.exec_equals_rollout_total).toBe('fail');
    expect(JSON.stringify(drifted.report)).not.toContain('99');
  }
});
