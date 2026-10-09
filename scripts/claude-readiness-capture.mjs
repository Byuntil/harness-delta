// Opt-in local pilot adapter. Preparation alone never installs hooks or activates collection.
// Never persist raw stdin or child stderr; normal recorder admission remains authoritative.
import { spawn, spawnSync } from 'node:child_process';
import { constants, closeSync, fstatSync, openSync, readFileSync, readSync, writeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const kinds = { PreToolUse: 'connect', SubagentStart: 'subagent_start', SubagentStop: 'subagent_stop' };
const reasons = new Set(['receipt_recorded', 'receipt_exists', 'session_forgotten', 'receipt_write_failed',
  'hook_input_invalid', 'hook_input_invalid_json', 'hook_input_too_large', 'session_id_invalid',
  'claude_pid_invalid', 'transcript_path_invalid', 'cwd_invalid', 'tool_use_id_invalid',
  'agent_id_invalid', 'agent_transcript_path_invalid']);
const statuses = new Set(['recorded', 'ignored', 'rejected', 'error']);
const maxBytes = 4 * 1048576;
const maxRows = 64;
const inputTooLarge = Symbol('input_too_large');

function privateFile(path, flags = constants.O_RDONLY) {
  const fd = openSync(path, flags | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
  const stat = fstatSync(fd);
  if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) || stat.uid !== process.getuid()) { closeSync(fd); throw new Error('unsafe'); }
  return fd;
}
function audit(path, row) {
  let fd;
  try {
    fd = privateFile(path, constants.O_RDWR | constants.O_APPEND);
    const stat = fstatSync(fd);
    const line = JSON.stringify(row) + '\n';
    if (stat.size + Buffer.byteLength(line) > 65536 || readFileSync(fd, 'utf8').split('\n').filter(Boolean).length >= maxRows) return;
    writeSync(fd, line);
  } catch { /* A failed audit never blocks native execution. */ }
  finally { if (fd !== undefined) closeSync(fd); }
}
function readInput(limit = maxBytes) {
  const chunks = []; let total = 0;
  while (total <= limit) {
    const part = Buffer.alloc(Math.min(65536, limit + 1 - total));
    const size = readSync(0, part);
    if (!size) return Buffer.concat(chunks);
    total += size; chunks.push(part.subarray(0, size));
  }
  throw inputTooLarge;
}

// Selected root proof is independent of stdin. Match the provider's normalized
// UID/start-time proof and require actual ancestry, never a PID/environment hint.
// This proves wrapper ancestry only, not genuine Claude hook dispatch.
function boundAncestry(config, serializedIdentity, budgetMs = 3000) {
  const deadline = performance.now() + budgetMs;
  const remaining = () => Math.floor(deadline - performance.now());
  try {
    const identity = JSON.parse(serializedIdentity);
    if (identity?.product !== 'claude_code' || identity.sessionId !== config.sessionId
      || identity.cwd !== config.projectRoot || identity.parentSessionId !== null
      || identity.nativeMapping?.nativeSessionId !== config.sessionId || identity.nativeMapping.agentId !== null) return false;
    const proof = identity.nativeMapping.processId;
    const match = typeof proof === 'string' && /^claude-process:([1-9][0-9]{0,9}):[a-f0-9]{64}$/.exec(proof);
    if (!match) return false;
    const rootPid = Number(match[1]);
    const env = { ...process.env, LC_ALL: 'C', TZ: 'UTC' };
    // Private macOS probe: use the OS binary, never a PATH-supplied replacement.
    if (remaining() <= 0) return false;
    const metadata = execFileSync('/bin/ps', ['-o', 'uid=', '-o', 'lstart=', '-p', String(rootPid)],
      { encoding: 'utf8', timeout: Math.min(2000, remaining()), maxBuffer: 4096, env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const fields = /^(\d+)\s+(.+)$/.exec(metadata);
    if (!fields || Number(fields[1]) !== process.getuid() || !Number.isFinite(Date.parse(fields[2]))) return false;
    const hash = createHash('sha256').update(JSON.stringify([rootPid, metadata])).digest('hex');
    if (proof !== `claude-process:${rootPid}:${hash}`) return false;
    const seen = new Set();
    let current = process.pid;
    for (let step = 0; step < 64 && current > 1; step++) {
      if (current === rootPid) return true;
      if (seen.has(current) || remaining() <= 0) return false;
      seen.add(current);
      const parent = execFileSync('/bin/ps', ['-o', 'ppid=', '-p', String(current)],
        { encoding: 'utf8', timeout: Math.min(2000, Math.max(1, remaining())), maxBuffer: 4096, env,
          stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      if (!/^[1-9][0-9]{0,9}$/.test(parent)) return false;
      current = Number(parent);
    }
    return false;
  } catch { return false; }
}

// Every poll rechecks the selected generation, root identity and actual ancestry.
// The OS metadata commands share the helper's remaining 500 ms budget.
function probeScope(config, originalIdentity, generation, budgetMs) {
  const began = performance.now();
  try {
    if (!(budgetMs > 0)) return false;
    const require = createRequire(config.databaseModule); const Database = require(config.databaseModule);
    const db = new Database(config.database, { readonly: true, fileMustExist: true, timeout: 0 });
    let task; let root;
    try {
      task = db.prepare('SELECT t.state,t.generation,p.local_root FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? AND p.id=?').get(config.taskId, config.projectId);
      root = db.prepare('SELECT identity,generation FROM session_bindings WHERE task_id=? AND session_id=? AND root_id=session_id AND state=?').get(config.taskId, config.sessionId, 'observing');
    } finally { db.close(); }
    return task?.state === 'active' && task.local_root === config.projectRoot && task.generation === generation
      && root?.generation === generation && root.identity === originalIdentity
      && boundAncestry(config, root.identity, budgetMs - (performance.now() - began));
  } catch { return false; }
}
async function probeWorker(config, rootIdentity, generation) {
  try {
    // Selected scope is independently proven before reading even control metadata.
    if (!probeScope(config, rootIdentity, generation, 500)) return;
    const request = JSON.parse(readInput(16384).toString('utf8'));
    if (!request || Object.keys(request).sort().join(',') !== 'agentId,deadlineNs,generation,transcriptPath'
      || !/^[A-Za-z0-9_-]{1,91}$/.test(request.agentId) || typeof request.transcriptPath !== 'string'
      || !/^[0-9]{1,30}$/.test(request.deadlineNs) || request.generation !== generation) return;
    const deadline = BigInt(request.deadlineNs); const remaining = () => Math.min(500, Number(deadline - process.hrtime.bigint()) / 1000000);
    const probe = config.readinessProbe;
    if (!probe || generation !== probe.generation || !(remaining() > 0) || !/^[a-f0-9]{64}$/.test(probe.moduleHash)) return;
    // Bounded regular operator code, never a module selected by hook input.
    const codeFd = openSync(probe.module, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let code;
    try { const stat = fstatSync(codeFd); if (!stat.isFile() || stat.nlink !== 1 || stat.size > 65536) return; code = readFileSync(codeFd); } finally { closeSync(codeFd); }
    if (createHash('sha256').update(code).digest('hex') !== probe.moduleHash || !(remaining() > 0)) return;
    const fd = privateFile(join(config.receipts, 'sessions', config.sessionId, 'agents', request.agentId + '.subagent_start.json'));
    let receipt;
    try { if (fstatSync(fd).size > 16384) return; receipt = JSON.parse(readFileSync(fd, 'utf8')); } finally { closeSync(fd); }
    const identity = JSON.parse(rootIdentity); const pid = Number(/^claude-process:([1-9][0-9]*):/.exec(identity.nativeMapping.processId)?.[1]);
    if (receipt.kind !== 'subagent_start' || receipt.session_id !== config.sessionId || receipt.agent_id !== request.agentId
      || receipt.cwd !== config.projectRoot || receipt.transcript_path !== request.transcriptPath || receipt.claude_pid !== pid || receipt.uid !== process.getuid() || !(remaining() > 0)) return;
    const { waitForReadinessProbeHold } = await import(pathToFileURL(probe.module).href);
    if (!(remaining() > 0)) return;
    const result = await waitForReadinessProbeHold({ directory: probe.directory, instanceId: probe.instanceId, receiptId: receipt.receipt_id,
      recordedAt: receipt.recorded_at, generation, maxWaitMs: remaining(), currentScope: budget => probeScope(config, rootIdentity, generation, Math.min(budget ?? 0, remaining())) });
    if (result?.status === 'acknowledged' && remaining() > 0 && probeScope(config, rootIdentity, generation, remaining())) process.stdout.write('{"status":"acknowledged"}\n');
  } catch { /* Parent receives no raw worker output or errors. */ }
}
async function waitForHold(configPath, config, input, generation, deadlineMs, deadlineNs, emit) {
  let acknowledged = false;
  if (performance.now() < deadlineMs) {
    acknowledged = await new Promise(resolve => {
      let child; let settled = false; let output = ''; let timer;
      const finish = success => {
        if (settled) return; settled = true; clearTimeout(timer);
        // Only the exact optional Node worker created here is signaled. Never a
        // root/native PID. Do not await worker teardown before releasing the hook.
        if (child) { try { child.kill('SIGKILL'); } catch { /* Already exited. */ } child.unref(); child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); }
        resolve(success && performance.now() < deadlineMs);
      };
      timer = setTimeout(() => finish(false), Math.max(0, deadlineMs - performance.now()));
      try {
        child = spawn(process.execPath, [process.argv[1], configPath, '--readiness-worker'], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
        child.on('error', () => finish(false)); child.on('close', () => finish(false)); child.stdin.on('error', () => {});
        child.stdout.on('data', bytes => {
          output += bytes.toString();
          if (Buffer.byteLength(output) > 128) { finish(false); return; }
          if (output === '{"status":"acknowledged"}\n') finish(true);
        });
        child.stderr.on('data', () => finish(false));
        child.stdin.end(JSON.stringify({ agentId: input.agent_id, transcriptPath: input.transcript_path, generation, deadlineNs }));
      } catch { finish(false); }
    });
  }
  emit('readiness_probe', acknowledged ? 'observed' : 'inconclusive', acknowledged ? 'hold_acknowledged' : 'hold_unverified');
}

async function main() {
  const [configPath, event] = process.argv.slice(2);
  const worker = event === '--readiness-worker';
  if (!worker && !Object.hasOwn(kinds, event)) return;
  const fd = privateFile(configPath);
  let config;
  try { if (fstatSync(fd).size > 16384) return; config = JSON.parse(readFileSync(fd, 'utf8')); }
  finally { closeSync(fd); }
  const require = createRequire(config.databaseModule);
  const Database = require(config.databaseModule);
  const db = new Database(config.database, { readonly: true, fileMustExist: true });
  let allowed; let rootIdentity; let generation;
  try {
    const task = db.prepare('SELECT t.state,t.generation,p.local_root FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? AND p.id=?').get(config.taskId, config.projectId);
    const linked = db.prepare('SELECT identity,generation FROM session_bindings WHERE task_id=? AND session_id=? AND root_id=session_id AND state=?').get(config.taskId, config.sessionId, 'observing');
    rootIdentity = linked?.identity; generation = task?.generation;
    allowed = task?.local_root === config.projectRoot && (event === 'PreToolUse' ? ['registered', 'active'].includes(task.state) : task.state === 'active' && !!linked && Number.isSafeInteger(generation) && linked.generation === generation);
  } finally { db.close(); }
  if (!allowed) return;
  if (worker) { await probeWorker(config, rootIdentity, generation); return; }
  const kind = kinds[event];
  const emit = (stage, status, reasonCode) => audit(config.audit, { schema_version: 1, kind, stage, status, reason_code: reasonCode });
  const childBoundary = event !== 'PreToolUse';
  if (childBoundary) {
    if (!probeScope(config, rootIdentity, generation, 3000)) return;
    emit('command_entry', 'observed', 'command_entered');
  }
  let bytes; let input;
  try { bytes = readInput(); }
  catch (error) { if (childBoundary) emit('input_guard', 'rejected', error === inputTooLarge ? 'input_too_large' : 'input_read_failed'); return; }
  try { input = JSON.parse(bytes.toString('utf8')); }
  catch { if (childBoundary) emit('input_guard', 'rejected', 'input_invalid_json'); return; }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    if (childBoundary) emit('input_guard', 'rejected', 'input_invalid_object'); return;
  }
  // Receipt admission retains exact payload scope. Child diagnostics are possible
  // here only because bound-root process ancestry was proven independently.
  for (const [field, expected, reason] of [['session_id', config.sessionId, 'input_session_mismatch'],
    ['cwd', config.projectRoot, 'input_cwd_mismatch'], ['hook_event_name', event, 'input_event_mismatch']]) {
    if (input[field] !== expected) { if (childBoundary) emit('input_guard', 'rejected', reason); return; }
  }
  if (event === 'PreToolUse' && (input.tool_name !== 'Bash' || typeof input.tool_input?.command !== 'string'
    || !/(^|[\s"'/])connect\.mjs["']?\s+connect\b[\s\S]*--product[ =]claude_code\b/.test(input.tool_input.command))) return;
  if (childBoundary && !probeScope(config, rootIdentity, generation, 3000)) return;
  emit('invocation', 'observed', 'recorder_invoked');
  const child = spawnSync(config.node, [config.hook, 'record', '--dir', config.receipts, '--diagnostics-session', config.sessionId],
    { input: bytes, encoding: 'utf8', maxBuffer: 65536, env: process.env });
  const deadlineMs = performance.now() + 500; const deadlineNs = (process.hrtime.bigint() + 500000000n).toString();
  if (child.error || child.status !== 0 || child.signal) { emit('command', 'error', 'hook_command_failed'); return; }
  let accepted = 0; let recorded = false;
  for (const line of (child.stderr ?? '').split('\n').filter(Boolean)) {
    let value;
    try { value = JSON.parse(line); } catch { continue; }
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'kind,reason_code,schema_version,status'
      || value.schema_version !== 1 || ![kind, null].includes(value.kind)
      || !statuses.has(value.status) || !reasons.has(value.reason_code)) continue;
    emit('recorder', value.status, value.reason_code); accepted++;
    recorded = value.kind === kind && value.status === 'recorded' && value.reason_code === 'receipt_recorded';
  }
  if (accepted !== 1) { emit('command', 'error', 'hook_diagnostic_unavailable'); return; }
  if (event === 'SubagentStart' && recorded && config.readinessProbe) await waitForHold(configPath, config, input, generation, deadlineMs, deadlineNs, emit);
}
try { await main(); } catch { /* No raw errors, stdout, stderr, timeout or native signal. */ }
