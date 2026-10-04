// Pinned Codex 0.160 SessionStart/SubagentStart metadata-only handoff. The socket
// response releases the native awaited hook only after registration and baseline.
// No stdout (native hook stdout can become model context). Delivery failure is
// observed by the parent; native failures may still allow model requests.
import { connect } from 'node:net';
const chunks = []; let size = 0;
const finish = code => process.exit(code);
const timer = setTimeout(() => finish(1), 5000);
process.stdin.on('data', chunk => { size += chunk.length; if (size <= 65536) chunks.push(chunk); });
process.stdin.on('error', () => finish(1));
process.stdin.on('end', () => {
  let value; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return finish(1); }
  if (size > 65536 || value === null || typeof value !== 'object' || Array.isArray(value)) return finish(1);
  const metadata = {};
  for (const key of ['session_id', 'transcript_path', 'cwd', 'hook_event_name', 'model', 'permission_mode', 'source', 'turn_id', 'agent_id', 'agent_type']) {
    if (key in value) metadata[key] = value[key];
  }
  const socket = connect(process.argv[2]); let response = '';
  socket.on('error', () => finish(1));
  socket.on('data', chunk => { response += chunk.toString('utf8'); if (response.length > 16) finish(1); });
  socket.on('end', () => { clearTimeout(timer); finish(response === 'ok\n' ? 0 : 1); });
  socket.write(JSON.stringify(metadata) + '\n');
});
