import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { startHookListener, type HookListener } from './hook-listener.js';
import { livePrompts, runLive, type LiveDeps } from './live.js';

const sessionId = '11112222-3333-4444-5555-666677778888';
const recorder = new URL('./session-start-recorder.mjs', import.meta.url).pathname;
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function listener(): Promise<{ dir: string; hooks: HookListener }> {
  const dir = mkdtempSync(join(tmpdir(), 'hd-conf-test-'));
  const hooks = await startHookListener(join(dir, 'h.sock'));
  cleanups.push(() => hooks.close(), () => rmSync(dir, { recursive: true, force: true }));
  return { dir, hooks };
}

function record(socketPath: string, input: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [recorder], { env: { HD_CONFORMANCE_HOOK_SOCKET: socketPath }, timeout: 10000 });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('close', status => resolve({ status, stdout, stderr }));
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });
}

async function settle(ready: () => boolean) {
  for (let attempt = 0; attempt < 50 && !ready(); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test('the recorder forwards only linkage fields and prints nothing', async () => {
  const { hooks } = await listener();
  const result = await record(hooks.socketPath, JSON.stringify({
    session_id: sessionId, transcript_path: `/synthetic/rollout-x-${sessionId}.jsonl`, cwd: '/synthetic/cwd',
    model: 'SECRET_MODEL', permission_mode: 'default', hook_event_name: 'SessionStart', source: 'startup',
    SECRET_KEY_NAME: 'SECRET_VALUE',
  }));
  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('');
  await settle(() => hooks.drain(false).length >= 1);
  const messages = hooks.drain();
  expect(messages).toHaveLength(1);
  const [message] = messages;
  expect(message).toMatchObject({
    sessionId, transcriptPath: `/synthetic/rollout-x-${sessionId}.jsonl`, cwd: '/synthetic/cwd',
    source: 'startup', eventName: 'SessionStart', unknownKeyCount: 1,
  });
  expect(message?.keyNames).toEqual(['cwd', 'hook_event_name', 'model', 'permission_mode', 'session_id', 'source', 'transcript_path']);
  expect(JSON.stringify(message)).not.toContain('SECRET');
  expect(hooks.drain()).toEqual([]);
});

test('invalid, oversized and unreachable deliveries are rejected without storing values', async () => {
  const { hooks } = await listener();
  for (const input of [
    'not json SECRET_TEXT',
    JSON.stringify({ session_id: 'SECRET-not-a-uuid', transcript_path: '/x', cwd: '/x', hook_event_name: 'SessionStart', source: 'startup' }),
    JSON.stringify({ session_id: sessionId, transcript_path: 'relative/SECRET', cwd: '/x', hook_event_name: 'SessionStart', source: 'startup' }),
    JSON.stringify({ session_id: sessionId, transcript_path: '/x', cwd: '/x', hook_event_name: 'SessionStart', source: 'startup', pad: 'x'.repeat(70000) }),
  ]) expect((await record(hooks.socketPath, input)).status).toBe(0);
  await settle(() => hooks.rejected() >= 3);
  expect(hooks.drain()).toEqual([]);
  expect(hooks.rejected()).toBeGreaterThanOrEqual(3);
  const other = await record(hooks.socketPath, JSON.stringify({
    session_id: sessionId, transcript_path: null, cwd: '/x', hook_event_name: 'SessionStart', source: 'SECRET_SOURCE',
  }));
  expect(other.status).toBe(0);
  await settle(() => hooks.drain(false).length >= 1);
  const [message] = hooks.drain();
  expect(message).toMatchObject({ transcriptPath: null, source: 'other' });
  expect(JSON.stringify(message)).not.toContain('SECRET');
  expect((await record('/nonexistent/h.sock', JSON.stringify({ session_id: sessionId }))).status).toBe(0);
});

const fake = new URL('./fixtures/fake-codex.mjs', import.meta.url).pathname;

function fakeDeps(mode: string, answer: string | null = 'confirm') {
  const root = mkdtempSync(join(tmpdir(), 'hd-conf-fake-'));
  const sessionsRoot = join(root, 'sessions');
  const configFile = join(root, 'config.toml');
  writeFileSync(configFile, '');
  const printed: string[] = [];
  const calls: string[][] = [];
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const deps: LiveDeps = {
    spawnProduct: (args, options) => new Promise(resolve => {
      calls.push([...args]);
      const startedAt = Date.now();
      const child = spawn(process.execPath, [fake, ...args], {
        cwd: options.cwd, timeout: options.timeoutMs,
        env: { PATH: process.env.PATH ?? '', FAKE_MODE: mode, FAKE_SESSIONS_ROOT: sessionsRoot, FAKE_CONFIG_FILE: configFile },
      });
      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
      child.on('close', code => resolve({ code, timedOut: false, spawnError: false, stdout, startedAt, exitedAt: Date.now() }));
    }),
    readConfirmationLine: () => Promise.resolve(answer),
    print: text => { printed.push(text); },
    now: Date.now,
    sessionsRoot,
    nodePath: process.execPath,
    recorderPath: recorder,
    runRoot: realpathSync(tmpdir()),
    configMetadata: () => JSON.stringify({ size: statSync(configFile).size }),
    productLabel: 'synthetic fake codex',
  };
  return { deps, printed, calls, outDir: join(root, 'out') };
}

test('an unconfirmed plan starts no product process', async () => {
  for (const answer of [null, 'yes', '']) {
    const { deps, calls, printed } = fakeDeps('ok', answer);
    const report = await runLive(deps, join(tmpdir(), 'unused'));
    expect(report.stop).toBe('not_confirmed');
    expect(calls).toEqual([]);
    expect(printed.join('\n')).toContain(livePrompts.initial);
  }
});

test('a JSON-wrapped model rejection keeps a fixed reason and stops before source lookup or automatic resume', async () => {
  const { deps, calls, outDir } = fakeDeps('ok');
  const spawnProduct = deps.spawnProduct.bind(deps);
  deps.spawnProduct = (args, options) => {
    if (args[0] !== 'exec') return spawnProduct(args, options);
    calls.push([...args]);
    const message = JSON.stringify({ type: 'error', status: 400, error: {
      message: "The 'synthetic-model' model is not supported when using Codex with a ChatGPT account.",
    }, secret: 'SECRET_BODY' });
    return Promise.resolve({ code: 1, timedOut: false, spawnError: false, startedAt: Date.now(), exitedAt: Date.now(),
      stdout: [
        { type: 'thread.started', thread_id: sessionId },
        { type: 'error', message },
        { type: 'turn.failed', error: { message } },
      ].map(row => JSON.stringify(row)).join('\n') });
  };
  const report = await runLive(deps, outDir);
  expect(report.stop).toBe('nonzero_exit');
  expect(report.stages).toHaveLength(1);
  expect(report.stages[0]).toMatchObject({ rolloutMatch: 'not_checked', conformance: null,
    exec: { turnCompleted: 0, failureReasons: ['chatgpt_account_model_not_supported'] } });
  expect(calls.map(args => args[0])).toEqual(['--version', 'exec', '--version']);
  const written = readFileSync(join(outDir, 'conformance-live-report.json'), 'utf8');
  expect(written).not.toMatch(/SECRET|synthetic-model/);
  expect(written).not.toContain(sessionId);
});

test('a confirmed synthetic run links both stages through the hook and reports enums only', async () => {
  const { deps, calls, printed, outDir } = fakeDeps('ok');
  const report = await runLive(deps, outDir);
  expect(report.stop).toBeNull();
  expect(report.productVersionBefore).toBe('match');
  expect(report.productVersionAfter).toBe('match');
  expect(report.configMetadataUnchanged).toBe(true);
  expect(calls.map(args => args[0])).toEqual(['--version', 'exec', 'exec', '--version']);
  expect(calls.flat().some(arg => arg.includes('dangerously-bypass-hook-trust'))).toBe(false);
  const [initial, resume] = report.stages;
  expect(initial?.hook).toMatchObject({
    received: 1, source: 'startup', eventName: 'SessionStart', sessionMatchesThread: true,
    transcriptMatchesRollout: true, cwdMatches: true, transcriptExistedAtReceipt: true, receivedBeforeExit: true,
  });
  expect(initial?.conformance?.checks).toMatchObject({
    exec_equals_rollout_total: 'pass', paired_turn_ids: 'pass', root_turn_topology: 'pass', session_id_matches_id: 'pass',
    thread_settings_applied: 'not_observed',
  });
  expect(resume?.hook).toMatchObject({ received: 1, source: 'resume', sessionMatchesThread: true, transcriptMatchesRollout: true });
  expect(resume?.sameRolloutAsInitial).toBe(true);
  expect(resume?.conformance?.checks).toMatchObject({
    exec_equals_rollout_total: 'pass', resume_total_equals_prior_plus_last: 'pass', thread_settings_applied: 'pass',
  });
  expect(resume?.conformance?.blocked).toBe(false);
  const path = join(outDir, 'conformance-live-report.json');
  expect(statSync(path).mode & 0o777).toBe(0o600);
  const written = readFileSync(path, 'utf8');
  expect(written).toBe(`${JSON.stringify(report)}\n`);
  const threadId = calls[2]?.[calls[2].indexOf('resume') + 1] ?? '';
  expect(threadId).toMatch(/^[0-9a-f-]{36}$/);
  for (const text of [written, printed.join('\n')]) {
    for (const forbidden of ['SECRET', threadId, 'synthetic-model', 'sha256:', realpathSync(tmpdir())]) {
      expect(text).not.toContain(forbidden);
    }
  }
  expect(written).not.toContain(livePrompts.initial);
}, 20_000);

test('a hook that is not trusted is recorded as missing without stopping the exec path', async () => {
  const { deps, outDir } = fakeDeps('hook-untrusted');
  const report = await runLive(deps, outDir);
  expect(report.stop).toBeNull();
  expect(report.stages.map(stage => stage.hook.received)).toEqual([0, 0]);
  expect(report.stages[0]?.conformance?.checks.exec_equals_rollout_total).toBe('pass');
}, 20_000);

test('stop conditions end the run without reading further', async () => {
  const conflict = fakeDeps('wrong-session-hook');
  const conflicted = await runLive(conflict.deps, conflict.outDir);
  expect(conflicted.stop).toBe('hook_conflict');
  expect(conflicted.stages).toHaveLength(1);
  expect(conflicted.stages[0]?.conformance).toBeNull();
  expect(conflicted.stages[0]?.hook.sessionMatchesThread).toBe(false);
  const version = fakeDeps('version');
  const mismatched = await runLive(version.deps, version.outDir);
  expect(mismatched.stop).toBe('version_mismatch');
  expect(version.calls).toEqual([['--version']]);
  const duplicate = fakeDeps('duplicate-file');
  const ambiguous = await runLive(duplicate.deps, duplicate.outDir);
  expect(ambiguous.stop).toBe('rollout_not_unique');
  expect(ambiguous.stages[0]?.rolloutMatch).toBe('ambiguous');
  const failing = fakeDeps('nonzero');
  expect((await runLive(failing.deps, failing.outDir)).stop).toBe('nonzero_exit');
  const writing = fakeDeps('config-write');
  const written = await runLive(writing.deps, writing.outDir);
  expect(written.stop).toBe('config_changed');
  expect(written.configMetadataUnchanged).toBe(false);
}, 60_000);

test('suffixed versions, anomalous hooks and changed threads stop the run', async () => {
  const suffixed = fakeDeps('version-suffix');
  expect((await runLive(suffixed.deps, suffixed.outDir)).stop).toBe('version_mismatch');
  expect(suffixed.calls).toEqual([['--version']]);
  for (const mode of ['hook-invalid', 'hook-null-transcript']) {
    const anomalous = fakeDeps(mode);
    const report = await runLive(anomalous.deps, anomalous.outDir);
    expect(report.stop).toBe('hook_conflict');
    expect(report.stages[0]?.conformance).toBeNull();
  }
  const fork = fakeDeps('resume-fork-hook');
  const forked = await runLive(fork.deps, fork.outDir);
  expect(forked.stop).toBe('hook_conflict');
  expect(forked.stages.map(stage => stage.hook.source)).toEqual(['startup', 'fork']);
  expect(forked.stages[1]?.conformance).toBeNull();
  const changed = fakeDeps('thread-change');
  const moved = await runLive(changed.deps, changed.outDir);
  expect(moved.stop).toBe('thread_changed');
  expect(moved.stages).toHaveLength(2);
}, 60_000);


test('an old checkpoint in the initial history cannot satisfy the resumed-stage checkpoint gate', async () => {
  const { deps, outDir } = fakeDeps('initial-checkpoint-only');
  const report = await runLive(deps, outDir);
  expect(report.stop).toBeNull();
  expect(report.stages[0]?.conformance?.checks.thread_settings_applied).toBe('pass');
  expect(report.stages[1]?.conformance?.checks.thread_settings_applied).toBe('not_observed');
});
