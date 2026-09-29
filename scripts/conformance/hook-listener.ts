import { createServer, type Socket } from 'node:net';

const codexIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** SessionStart input keys in the Codex rust-v0.158.0 generated schema. */
const knownKeys = new Set(['cwd', 'hook_event_name', 'model', 'permission_mode', 'session_id', 'source', 'transcript_path']);
const sources = new Set(['startup', 'resume', 'clear', 'compact', 'fork']);
const messageLimit = 16384;
const pathLimit = 4096;

export type HookSource = 'startup' | 'resume' | 'clear' | 'compact' | 'fork' | 'other';

/** Held in memory for linkage checks; only derived enums and key names may be reported. */
export interface HookMessage {
  readonly sessionId: string;
  readonly transcriptPath: string | null;
  readonly cwd: string | null;
  readonly source: HookSource;
  readonly eventName: 'SessionStart' | 'other';
  readonly keyNames: readonly string[];
  readonly unknownKeyCount: number;
  readonly receivedAt: number;
  /** Whether the reported transcript path existed when the hook arrived (stat only, never opened). */
  readonly transcriptExistedAtReceipt: boolean | null;
}

export interface HookListenerOptions {
  readonly now?: () => number;
  readonly exists?: (path: string) => boolean;
}

export interface HookListener {
  readonly socketPath: string;
  /** Returns received messages; `consume` false leaves them queued. */
  drain(consume?: boolean): HookMessage[];
  rejected(): number;
  close(): Promise<void>;
}

const absolutePath = (value: unknown): string | null | undefined =>
  value === null ? null
    : typeof value === 'string' && value.startsWith('/') && value.length <= pathLimit && !value.includes('\0') ? value
      : undefined;

function parseMessage(text: string, receivedAt: number, exists: ((path: string) => boolean) | undefined): HookMessage | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (typeof message.session_id !== 'string' || !codexIdPattern.test(message.session_id)) return null;
  const transcriptPath = absolutePath(message.transcript_path);
  const cwd = absolutePath(message.cwd);
  if (transcriptPath === undefined || cwd === undefined) return null;
  const names = Array.isArray(message.key_names) ? message.key_names.filter((name): name is string => typeof name === 'string') : [];
  return {
    sessionId: message.session_id,
    transcriptPath,
    cwd,
    source: typeof message.source === 'string' && sources.has(message.source) ? message.source as HookSource : 'other',
    eventName: message.hook_event_name === 'SessionStart' ? 'SessionStart' : 'other',
    keyNames: names.filter(name => knownKeys.has(name)).sort(),
    unknownKeyCount: names.filter(name => !knownKeys.has(name)).length,
    receivedAt,
    transcriptExistedAtReceipt: transcriptPath === null || exists === undefined ? null : exists(transcriptPath),
  };
}

export async function startHookListener(socketPath: string, options: HookListenerOptions = {}): Promise<HookListener> {
  const now = options.now ?? Date.now;
  const exists = options.exists;
  const messages: HookMessage[] = [];
  let rejected = 0;
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.setTimeout(5_000, () => { rejected += 1; socket.destroy(); });
    const chunks: Buffer[] = [];
    let size = 0;
    socket.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= messageLimit) chunks.push(chunk);
    });
    socket.on('error', () => { rejected += 1; });
    socket.on('end', () => {
      const message = size > messageLimit ? null : parseMessage(Buffer.concat(chunks).toString('utf8'), now(), exists);
      if (message === null) rejected += 1; else messages.push(message);
      socket.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => { server.off('error', reject); resolve(); });
  });
  return {
    socketPath,
    drain: (consume = true) => consume ? messages.splice(0) : [...messages],
    rejected: () => rejected,
    close: () => new Promise<void>(resolve => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }),
  };
}
