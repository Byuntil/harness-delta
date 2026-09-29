import type { CounterVector } from './checks.js';

const codexIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** `ThreadEvent` tags in Codex rust-v0.158.0 `exec/src/exec_events.rs`; others are counted as `other`. */
const knownTypes = new Set([
  'thread.started', 'turn.started', 'turn.completed', 'turn.failed', 'item.started', 'item.updated', 'item.completed', 'error',
]);

export interface ExecStreamSummary {
  readonly types: Readonly<Record<string, number>>;
  readonly unparsed: number;
  readonly threadIdPresent: boolean;
  readonly turnCompleted: number;
  readonly threadIdConflict: boolean;
}

/** In-memory values used for checks; only `summary` may enter a report. */
export interface ExecStreamReduction {
  readonly threadId: string | null;
  readonly usage: CounterVector | null;
  readonly summary: ExecStreamSummary;
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : null;
const integer = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) ? value : null;

function usageVector(usage: ObjectValue): CounterVector {
  return {
    input: integer(usage.input_tokens),
    cached: integer(usage.cached_input_tokens),
    output: integer(usage.output_tokens),
    reasoning: integer(usage.reasoning_output_tokens),
    cacheWrite: integer(usage.cache_write_input_tokens),
    totalTokens: integer(usage.total_tokens),
  };
}

/**
 * Reduces `codex exec --json` stdout. Message text, item bodies and unknown type
 * names never leave this function; more than one completed turn yields no usage.
 */
export function reduceExecStream(stdout: string): ExecStreamReduction {
  const types: Record<string, number> = {};
  let unparsed = 0;
  let threadId: string | null = null;
  let threadIdConflict = false;
  let turnCompleted = 0;
  let usage: CounterVector | null = null;
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue;
    let event: ObjectValue | null;
    try { event = object(JSON.parse(line)); } catch { unparsed += 1; continue; }
    if (event === null) { unparsed += 1; continue; }
    const type = typeof event.type === 'string' && knownTypes.has(event.type) ? event.type : 'other';
    types[type] = (types[type] ?? 0) + 1;
    if (type === 'thread.started') {
      const candidate = typeof event.thread_id === 'string' && codexIdPattern.test(event.thread_id) ? event.thread_id : null;
      if (threadId !== null && candidate !== threadId) threadIdConflict = true;
      threadId ??= candidate;
    }
    if (type === 'turn.completed') {
      turnCompleted += 1;
      const reported = object(event.usage);
      usage = reported === null ? null : usageVector(reported);
    }
  }
  return {
    threadId: threadIdConflict ? null : threadId,
    usage: turnCompleted === 1 ? usage : null,
    summary: { types, unparsed, threadIdPresent: threadId !== null && !threadIdConflict, turnCompleted, threadIdConflict },
  };
}
