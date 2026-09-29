import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { reduceExecStream } from '../scripts/conformance/exec-stream.js';

const threadId = '11112222-3333-4444-5555-666677778888';
const stream = (...rows: unknown[]) => rows.map(row => typeof row === 'string' ? row : JSON.stringify(row)).join('\n');
const usage = { input_tokens: 10, cached_input_tokens: 8, cache_write_input_tokens: 0, output_tokens: 2, reasoning_output_tokens: 0 };

test('exec stream reduction keeps the thread id in memory and the usage vector without text', () => {
  const reduced = reduceExecStream(stream(
    { type: 'thread.started', thread_id: threadId },
    { type: 'turn.started' },
    { type: 'item.completed', item: { type: 'agent_message', text: 'SECRET_RESPONSE' } },
    { type: 'turn.completed', usage },
    'not json SECRET_LINE',
    { type: 'Weird Name!' },
    { type: threadId },
    { type: 'turn.failed' },
  ));
  expect(reduced.threadId).toBe(threadId);
  expect(reduced.usage).toEqual({ input: 10, cached: 8, output: 2, reasoning: 0, cacheWrite: 0, totalTokens: null });
  expect(reduced.summary).toEqual({
    types: { 'thread.started': 1, 'turn.started': 1, 'item.completed': 1, 'turn.completed': 1, 'turn.failed': 1, other: 2 },
    unparsed: 1, threadIdPresent: true, turnCompleted: 1, threadIdConflict: false,
  });
  expect(JSON.stringify(reduced.summary)).not.toContain('SECRET');
  expect(JSON.stringify(reduced.summary)).not.toContain(threadId);
});

test('exec stream reduction fails closed on missing, invalid or conflicting values', () => {
  expect(reduceExecStream('').threadId).toBeNull();
  expect(reduceExecStream(stream({ type: 'thread.started', thread_id: 'not-a-uuid' })).threadId).toBeNull();
  const conflict = reduceExecStream(stream(
    { type: 'thread.started', thread_id: threadId },
    { type: 'thread.started', thread_id: '99992222-3333-4444-5555-666677778888' },
  ));
  expect(conflict.threadId).toBeNull();
  expect(conflict.summary.threadIdConflict).toBe(true);
  const missing = reduceExecStream(stream({ type: 'turn.completed', usage: { input_tokens: 1 } }));
  expect(missing.usage).toEqual({ input: 1, cached: null, output: null, reasoning: null, cacheWrite: null, totalTokens: null });
  const negative = reduceExecStream(stream({ type: 'turn.completed', usage: { ...usage, output_tokens: -1 } }));
  expect(negative.usage?.output).toBe(-1);
  const twice = reduceExecStream(stream({ type: 'turn.completed', usage }, { type: 'turn.completed', usage }));
  expect(twice.usage).toBeNull();
  expect(twice.summary.turnCompleted).toBe(2);
  expect(readFileSync(new URL('../scripts/conformance/exec-stream.ts', import.meta.url), 'utf8')).not.toContain('node:fs');
});
