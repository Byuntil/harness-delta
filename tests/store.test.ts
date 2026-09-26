import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test } from 'vitest';
import { Store } from '../src/store.js';
import { EventSchema } from '../src/contracts.js';
import { seedLinkedTask } from './helpers/store-fixture.js';

const event = EventSchema.parse({ id: 'e1', project_id: 'p1', task_id: 't1', session_id: 's1',
  source_key: 'source:1', occurred_at: '2026-01-01T00:00:00Z', payload: { kind: 'session_linked' } });

test('replay and alternate event ID for an identical source are idempotent', () => {
  const store = new Store(':memory:');
  try {
    seedLinkedTask(store, { projectId: 'p1', taskId: 't1', sessionId: 's1' });
    expect(store.putEvent(event)).toBe(true);
    expect(store.putEvent(event)).toBe(false);
    expect(store.putEvent({ ...event, id: 'e2' })).toBe(false);
    expect(store.eventCount()).toBe(1);
    expect(() => store.putEvent({ ...event, occurred_at: '2026-01-02T00:00:00Z' })).toThrow('event_conflict');
    expect(() => store.putEvent({ ...event, source_key: 'source:2' })).toThrow('event_conflict');
    expect(store.eventCount()).toBe(1);
  } finally { store.close(); }
});

test('relationship mismatch and transaction failure cannot persist events', () => {
  const store = new Store(':memory:');
  try {
    seedLinkedTask(store, { projectId: 'p1', taskId: 't1', sessionId: 's1' });
    seedLinkedTask(store, { projectId: 'p2', taskId: 't2', sessionId: 's2' });
    expect(() => store.putEvent({ ...event, session_id: 's2' })).toThrow();
    expect(() => store.transaction(() => { store.putEvent(event); throw new Error('abort'); })).toThrow('abort');
    expect(store.eventCount()).toBe(0);
  } finally { store.close(); }
});

test('events survive reopen and newer schema versions are refused without mutation', () => {
  const root = mkdtempSync(join(tmpdir(), 'store-test-'));
  const file = join(root, 'local.db');
  try {
    let store = new Store(file);
    seedLinkedTask(store, { projectId: 'p1', taskId: 't1', sessionId: 's1' });
    store.putEvent(event); store.close();
    store = new Store(file);
    expect(store.putEvent(event)).toBe(false);
    expect(store.eventCount()).toBe(1); store.close();
    const db = new Database(file); db.pragma('user_version = 999'); db.close();
    expect(() => new Store(file)).toThrow('unsupported_schema_version');
    const reopened = new Database(file);
    expect(reopened.pragma('user_version', { simple: true })).toBe(999); reopened.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a child session cannot name a parent belonging to a different task', () => {
  const store = new Store(':memory:');
  try {
    seedLinkedTask(store, { projectId: 'p1', taskId: 't1', sessionId: 's1' });
    seedLinkedTask(store, { projectId: 'p2', taskId: 't2', sessionId: 's2' });
    expect(() => store.execute('UPDATE sessions SET parent_id = ? WHERE id = ?', ['s1', 's2'])).toThrow();
  } finally { store.close(); }
});

test('invalid events are rejected without reflecting private content in diagnostics', () => {
  const store = new Store(':memory:');
  try {
    seedLinkedTask(store, { projectId: 'p1', taskId: 't1', sessionId: 's1' });
    const privateEvent = { ...event, payload: { kind: 'session_linked' as const, prompt: 'SYNTHETIC_PRIVATE_SENTINEL' } };
    expect(() => store.putEvent(privateEvent)).toThrow(/^invalid_event$/);
    expect(store.eventCount()).toBe(0);
  } finally { store.close(); }
});

test('typed usage survives reopen and replays without duplication', () => {
  const root = mkdtempSync(join(tmpdir(), 'usage-store-test-'));
  const file = join(root, 'local.db');
  const reading = { status: 'observed', value: 0, reason: null };
  const usage = EventSchema.parse({ ...event, payload: { kind: 'usage', input_total: reading,
    cached_input: reading, output_total: reading, reasoning_output: reading,
    product: 'codex', product_version: '0.156.1', model: 'gpt-6-astra', epoch: 'epoch1' } });
  try {
    const store = new Store(file);
    try {
      seedLinkedTask(store, { projectId: 'p1', taskId: 't1', sessionId: 's1' });
      expect(store.putEvent(usage)).toBe(true);
    } finally { store.close(); }
    const reopened = new Store(file);
    try {
      expect(reopened.putEvent(usage)).toBe(false);
      if (usage.payload.kind !== 'usage') throw new Error('fixture_kind');
      const changed = { ...usage, payload: { ...usage.payload,
        input_total: { status: 'observed' as const, value: 1, reason: null } } };
      expect(() => reopened.putEvent(changed)).toThrow('event_conflict');
      expect(reopened.putEvent(usage)).toBe(false);
      expect(reopened.eventCount()).toBe(1);
    }
    finally { reopened.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
