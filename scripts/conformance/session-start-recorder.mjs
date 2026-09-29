// Conformance-only Codex SessionStart hook command. Reads the hook input from stdin in
// memory and forwards only linkage fields and input key names to the runner's Unix socket.
// It prints nothing, because SessionStart stdout can become model context, and always
// exits 0 so a delivery failure is observed by the runner as a missing hook.
import { connect } from 'node:net';

const limit = 65536;
const socketPath = process.env.HD_CONFORMANCE_HOOK_SOCKET;
const chunks = [];
let size = 0;
const done = () => process.exit(0);
setTimeout(done, 5000).unref();

process.stdin.on('data', chunk => {
  size += chunk.length;
  if (size <= limit) chunks.push(chunk);
});
process.stdin.on('error', done);
process.stdin.on('end', () => {
  if (size > limit || typeof socketPath !== 'string' || socketPath === '') return done();
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { input = null; }
  const object = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : null;
  const message = object === null ? { invalid: true } : {
    session_id: object.session_id,
    transcript_path: object.transcript_path,
    source: object.source,
    hook_event_name: object.hook_event_name,
    cwd: object.cwd,
    key_names: Object.keys(object),
  };
  const socket = connect(socketPath);
  socket.on('error', done);
  socket.on('close', done);
  socket.end(`${JSON.stringify(message)}\n`);
});
