#!/usr/bin/env node
// Claude Code-only metadata recorder for Harness Delta session binding.
//
// `record` runs as a command hook registered by the harness-connect skill's
// frontmatter. Claude Code supplies the hook JSON on stdin and sets CLAUDE_PID;
// the model does not author either value. Only identifiers and native source
// paths are persisted: tool input, prompts, responses, last_assistant_message
// and transcript text are never written. The hook always exits 0 without
// stdout so it cannot block or steer the session. An explicitly selected
// diagnostic session enables fixed-code stderr only; raw stdin/errors are never
// emitted. Diagnostics do not establish lifecycle or usage completeness.
//
// `locate` runs inside the Bash tool for the connect helper. CLAUDE_CODE_SESSION_ID
// only narrows the lookup; a receipt is returned only when the hook-recorded
// CLAUDE_PID is an actual OS ancestor of this process.
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, constants, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const receiptSchemaVersion = 1;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
// uuid + ':' + agent ID must fit the shared 128-character identifier limit.
const agentId = /^[A-Za-z0-9_-]{1,91}$/;
const agentType = /^[^\p{Cc}\p{Cf}]{1,128}$/u;
const toolUseId = /^[A-Za-z0-9_-]{1,128}$/;
const maxInput = 4 * 1048576;
const locateMaxAgeMs = 120000;
// Any Bash command naming connect.mjs, the connect operation and the Claude product
// produces a receipt for the session Claude Code reports; the text is never stored.
// A model can trigger it deliberately, but only for its own current session.
const connectCommand = /(^|[\s"'/])connect\.mjs["']?\s+connect\b[\s\S]*--product[ =]claude_code\b/;

export function defaultReceiptDir(env = process.env) {
  if (env.HARNESS_DELTA_CLAUDE_RECEIPT_DIR) return env.HARNESS_DELTA_CLAUDE_RECEIPT_DIR;
  const state = env.XDG_STATE_HOME && isAbsolute(env.XDG_STATE_HOME) ? env.XDG_STATE_HOME : join(homedir(), '.local', 'state');
  return join(state, 'harness-delta', 'claude-receipts');
}
const text = (value, max = 4096) => typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
const absolute = value => { const v = text(value); return v && isAbsolute(v) && !v.includes('\0') ? v : null; };
const match = (value, pattern) => typeof value === 'string' && pattern.test(value) ? value : null;
const pid = value => /^[1-9][0-9]{0,9}$/.test(String(value ?? '')) ? Number(value) : null;

function privateDir(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) throw new Error('receipt_dir_unsafe');
}
function writeOnce(dir, name, value) {
  privateDir(dir);
  const temporary = join(dir, `.${name}.${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(value) + '\n', { mode: 0o600, flag: 'wx' });
  // link() fails when the target exists: the first writer wins atomically, so parallel
  // skill-hook copies and SubagentStart replays keep the original receipt.
  try { linkSync(temporary, join(dir, name)); return true; } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  } finally { unlinkSync(temporary); }
}
const receiptId = parts => {
  const hex = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${(8 | (parseInt(hex[16], 16) & 3)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

/** Internal fixed-code result; no rejected value or payload is retained. */
function projectHookResult(input, env, now) {
  const reject = reasonCode => ({ receipt: null, reasonCode });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return reject('hook_input_invalid');
  const event = input.hook_event_name;
  if (!['PreToolUse', 'SubagentStart', 'SubagentStop'].includes(event)) return reject('hook_event_unselected');
  if (event === 'PreToolUse' && (input.tool_name !== 'Bash' || typeof input.tool_input?.command !== 'string' || !connectCommand.test(input.tool_input.command))) return reject('tool_unselected');
  const sessionId = match(input.session_id, uuid);
  const claudePid = pid(env.CLAUDE_PID);
  const transcript = absolute(input.transcript_path);
  const cwd = absolute(input.cwd);
  if (!sessionId) return reject('session_id_invalid');
  if (!claudePid) return reject('claude_pid_invalid');
  if (!transcript) return reject('transcript_path_invalid');
  if (!cwd) return reject('cwd_invalid');
  const base = { schema_version: receiptSchemaVersion, session_id: sessionId, transcript_path: transcript, cwd,
    claude_pid: claudePid, recorded_at: now.toISOString(), uid: typeof process.getuid === 'function' ? process.getuid() : null };
  if (event === 'PreToolUse') {
    const tool = match(input.tool_use_id, toolUseId);
    if (!tool) return reject('tool_use_id_invalid');
    // Present only inside a subagent call (official common hook field).
    const caller = input.agent_id === undefined ? null : match(input.agent_id, agentId);
    if (input.agent_id !== undefined && caller === null) return reject('agent_id_invalid');
    return { receipt: { ...base, kind: 'connect', receipt_id: receiptId(['connect', sessionId, tool]), agent_id: caller,
      agent_type: match(input.agent_type ?? '', agentType), agent_transcript_path: null }, reasonCode: null };
  }
  if (event === 'SubagentStart' || event === 'SubagentStop') {
    const child = match(input.agent_id, agentId);
    if (!child) return reject('agent_id_invalid');
    const childPath = event === 'SubagentStop' ? absolute(input.agent_transcript_path) : null;
    if (event === 'SubagentStop' && childPath === null) return reject('agent_transcript_path_invalid');
    const kind = event === 'SubagentStart' ? 'subagent_start' : 'subagent_stop';
    return { receipt: { ...base, kind, receipt_id: receiptId([kind, sessionId, child]), agent_id: child,
      agent_type: match(input.agent_type ?? '', agentType), agent_transcript_path: childPath }, reasonCode: null };
  }
  return reject('hook_event_unselected');
}

/** Projects hook stdin to an allowlisted receipt, or null when the event is not recorded. */
export function projectHookInput(input, env = process.env, now = new Date()) {
  return projectHookResult(input, env, now).receipt;
}

function writeReceiptResult(dir, receipt) {
  privateDir(dir);
  // A deleted session stays deleted: its later hook events are not recorded.
  try { lstatSync(join(dir, 'forgotten', receipt.session_id)); return 'session_forgotten'; } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const written = receipt.kind === 'connect'
    ? writeOnce(join(dir, 'connect'), receipt.receipt_id + '.json', receipt)
    : writeOnce(join(dir, 'sessions', receipt.session_id, 'agents'), `${receipt.agent_id}.${receipt.kind}.json`, receipt);
  return written ? 'receipt_recorded' : 'receipt_exists';
}

export function writeReceipt(dir, receipt) {
  return writeReceiptResult(dir, receipt) === 'receipt_recorded';
}

function readStdin() {
  const input = readFileSync(0);
  if (input.length > maxInput) throw new Error('hook_input_too_large');
  return input.toString('utf8');
}

function ancestors(start) {
  const chain = []; let current = start;
  for (let i = 0; i < 64 && current > 1; i++) {
    chain.push(current);
    let parent;
    try { parent = Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(current)], { encoding: 'utf8', timeout: 2000 }).trim()); } catch { break; }
    if (!Number.isSafeInteger(parent) || parent === current) break;
    current = parent;
  }
  return chain;
}
function readPrivateJson(path) {
  let fd;
  try {
    // Symlinks, vanished entries and foreign or loose files are skipped individually.
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 16384 || (stat.mode & 0o077) !== 0 || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) return null;
    return JSON.parse(readFileSync(fd, 'utf8'));
  } catch { return null; } finally { if (fd !== undefined) closeSync(fd); }
}

/** Returns the newest fresh connect receipt recorded for this exact process ancestry. */
export function locateReceipt(dir, env = process.env, now = Date.now(), chain = ancestors(process.pid)) {
  const sessionId = match(env.CLAUDE_CODE_SESSION_ID, uuid);
  if (!sessionId) return { receipt: null, reason: 'current_identity_unavailable' };
  let names;
  try { names = readdirSync(join(dir, 'connect')).filter(name => /^[a-f0-9-]{36}\.json$/.test(name)); } catch { return { receipt: null, reason: 'hook_receipt_missing' }; }
  const candidates = names.map(name => readPrivateJson(join(dir, 'connect', name))).filter(r => r && r.kind === 'connect'
    && r.session_id === sessionId && chain.includes(r.claude_pid) && now - Date.parse(r.recorded_at) >= -5000 && now - Date.parse(r.recorded_at) <= locateMaxAgeMs)
    .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at));
  if (candidates.length === 0) return { receipt: null, reason: 'hook_receipt_missing' };
  // The main thread and subagents share session and PID; mixed fresh receipts are ambiguous.
  if (new Set(candidates.map(r => r.agent_id)).size > 1) return { receipt: null, reason: 'hook_receipt_ambiguous' };
  return { receipt: candidates[0].receipt_id, identity_basis: 'claude_hook_receipt', role: candidates[0].agent_id === null ? 'root' : 'child' };
}

function main(argv) {
  const [operation, ...rest] = argv;
  const dirIndex = rest.indexOf('--dir');
  const dir = dirIndex >= 0 && rest[dirIndex + 1] ? rest[dirIndex + 1] : defaultReceiptDir();
  if (operation === 'record') {
    const diagnosticIndex = rest.indexOf('--diagnostics-session');
    const diagnosticSession = diagnosticIndex >= 0 ? match(rest[diagnosticIndex + 1], uuid) : null;
    let kind = null;
    let diagnosticEnabled = diagnosticSession !== null;
    // The schema contains only fixed enum values, never hook values or exception text.
    const report = (status, reasonCode) => {
      if (diagnosticEnabled) {
        try { writeSync(2, JSON.stringify({ schema_version: 1, kind, status, reason_code: reasonCode }) + '\n'); } catch { /* Never block the session. */ }
      }
    };
    let input;
    try { input = JSON.parse(readStdin()); } catch (error) {
      report('rejected', error.message === 'hook_input_too_large' ? 'hook_input_too_large' : 'hook_input_invalid_json');
      return;
    }
    // Invalid identities can be diagnosed; a valid different session cannot.
    if (match(input?.session_id, uuid) && input.session_id !== diagnosticSession) diagnosticEnabled = false;
    const event = input?.hook_event_name;
    kind = event === 'PreToolUse' ? 'connect' : event === 'SubagentStart' ? 'subagent_start' : event === 'SubagentStop' ? 'subagent_stop' : null;
    const result = projectHookResult(input, process.env, new Date());
    if (!result.receipt) {
      if (!['hook_event_unselected', 'tool_unselected'].includes(result.reasonCode)) report('rejected', result.reasonCode);
      return;
    }
    try {
      const reasonCode = writeReceiptResult(dir, result.receipt);
      report(reasonCode === 'receipt_recorded' ? 'recorded' : 'ignored', reasonCode);
    } catch { report('error', 'receipt_write_failed'); }
    return;
  }
  if (operation === 'locate') { process.stdout.write(JSON.stringify(locateReceipt(dir)) + '\n'); return; }
  process.stderr.write('usage: claude-session-hook.mjs record|locate [--dir DIR] [--diagnostics-session UUID]\n');
  process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main(process.argv.slice(2));
