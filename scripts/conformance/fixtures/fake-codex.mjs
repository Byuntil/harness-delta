// Synthetic stand-in for `codex` used only by the manual conformance suite. It never
// contacts a model. It mimics the rust-v0.158.0 behaviors the live runner depends on:
// `-c` keys split on every `.`, SessionStart hook trust by state key and hash, the exec
// JSON stream, and a cumulative rollout file named by thread id.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const mode = process.env.FAKE_MODE ?? 'ok';
const sessionsRoot = process.env.FAKE_SESSIONS_ROOT;
const args = process.argv.slice(2);
const version = mode === 'version' ? '0.157.0' : '0.158.0';
const printedVersion = mode === 'version-suffix' ? '0.158.0-alpha.1' : version;
if (args[0] === '--version') {
  process.stdout.write(`codex-cli ${printedVersion}\n`);
  process.exit(0);
}
if (args[0] !== 'exec' || !sessionsRoot) process.exit(2);

const overrides = [];
for (let index = 0; index < args.length; index += 1) if (args[index] === '-c') overrides.push(args[index + 1] ?? '');
const split = override => {
  const at = override.indexOf('=');
  return { segments: override.slice(0, at).split('.'), value: override.slice(at + 1) };
};
const hookOverride = overrides.map(split).find(entry => entry.segments.join('/') === 'hooks/SessionStart');
const stateOverride = overrides.map(split).find(entry => entry.segments.join('/') === 'hooks/state');
const command = /command="([^"]+)"/.exec(hookOverride?.value ?? '')?.[1] ?? null;
const state = /^\{"([^"]+)"=\{trusted_hash="(sha256:[0-9a-f]{64})"\}\}$/.exec(stateOverride?.value ?? '');
const identity = command === null ? '' : JSON.stringify({
  event_name: 'session_start', hooks: [{ async: false, command, timeout: 600, type: 'command' }],
});
const expectedHash = `sha256:${createHash('sha256').update(identity).digest('hex')}`;
const trusted = mode !== 'hook-untrusted' && command !== null && state !== null &&
  state[1] === '/<session-flags>/config.toml:session_start:0:0' && state[2] === expectedHash;

const resumeAt = args.indexOf('resume');
const threadId = resumeAt >= 0 && mode !== 'thread-change' ? args[resumeAt + 1] : randomUUID();
const now = new Date();
const day = join(sessionsRoot, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'));
mkdirSync(day, { recursive: true });
const existing = readdirSync(day).find(name => name.endsWith(`-${threadId}.jsonl`));
const file = join(day, existing ?? `rollout-2026-01-01T00-00-00-${threadId}.jsonl`);
const row = (type, payload) => `${JSON.stringify({ timestamp: new Date().toISOString(), type, payload })}\n`;
const cwd = process.cwd();
const turn = resumeAt >= 0 ? 'turn-2' : 'turn-1';
const totals = resumeAt >= 0
  ? { input_tokens: 30, cached_input_tokens: 20, cache_write_input_tokens: 0, output_tokens: 4, reasoning_output_tokens: 0, total_tokens: 34 }
  : { input_tokens: 10, cached_input_tokens: 5, cache_write_input_tokens: 0, output_tokens: 2, reasoning_output_tokens: 0, total_tokens: 12 };
const last = resumeAt >= 0
  ? { input_tokens: 20, cached_input_tokens: 15, cache_write_input_tokens: 0, output_tokens: 2, reasoning_output_tokens: 0, total_tokens: 22 }
  : totals;

if (existing === undefined) {
  writeFileSync(file, row('session_meta', {
    id: threadId, session_id: threadId, cwd, cli_version: version, source: 'exec',
    creator_account_id: 'SECRET_ACCOUNT', base_instructions: 'SECRET_INSTRUCTIONS',
  }));
  if (mode === 'duplicate-file') writeFileSync(join(day, `rollout-2026-01-01T00-00-01-${threadId}.jsonl`), '');
} else {
  appendFileSync(file, row('event_msg', { type: 'thread_settings_applied' }));
}
appendFileSync(file, row('turn_context', { model: 'synthetic-model', cwd, turn_id: turn, root_turn_id: turn }));
appendFileSync(file, row('event_msg', { type: 'task_started', turn_id: turn }));
if (trusted) {
  const hookInput = {
    session_id: mode === 'wrong-session-hook' ? randomUUID() : mode === 'hook-invalid' ? 'not-a-session' : threadId,
    transcript_path: mode === 'hook-null-transcript' ? null : file, cwd,
    model: 'synthetic-model', permission_mode: 'default', hook_event_name: 'SessionStart',
    source: resumeAt >= 0 ? (mode === 'resume-fork-hook' ? 'fork' : 'resume') : 'startup',
  };
  spawnSync(command, { input: JSON.stringify(hookInput), stdio: ['pipe', 'ignore', 'ignore'] });
}
appendFileSync(file, row('response_item', { type: 'message', content: 'SECRET_REPLY' }));
appendFileSync(file, row('event_msg', { type: 'token_count', info: { total_token_usage: totals, last_token_usage: last } }));
appendFileSync(file, row('event_msg', { type: 'task_complete', turn_id: turn }));
if (mode === 'config-write' && process.env.FAKE_CONFIG_FILE) appendFileSync(process.env.FAKE_CONFIG_FILE, 'x');

const execUsage = Object.fromEntries(Object.entries(totals).filter(([key]) => key !== 'total_tokens'));
for (const event of [
  { type: 'thread.started', thread_id: threadId },
  { type: 'turn.started' },
  { type: 'item.completed', item: { type: 'agent_message', text: 'SECRET_REPLY' } },
  { type: 'turn.completed', usage: execUsage },
]) process.stdout.write(`${JSON.stringify(event)}\n`);
process.stderr.write('SECRET_STDERR\n');
process.exit(mode === 'nonzero' ? 1 : 0);
