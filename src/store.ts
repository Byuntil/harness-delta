import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { Event } from './contracts.js';
import { EventSchema } from './contracts.js';

type EventRow = Omit<Event, 'payload'> & { payload: string };

export class Store {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    try {
      const version = this.db.pragma('user_version', { simple: true });
      if (version !== 0 && version !== 1) throw new Error('unsupported_schema_version');
      this.db.pragma('foreign_keys = ON');
      if (version === 0) {
        this.db.transaction(() => {
          this.db.exec(readFileSync(new URL('./migrations/001_initial.sql', import.meta.url), 'utf8'));
          this.db.pragma('user_version = 1');
        })();
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  close(): void { this.db.close(); }

  execute(sql: string, params: unknown[]): void { this.db.prepare(sql).run(...params); }

  transaction<T>(action: () => T): T { return this.db.transaction(action)(); }

  putEvent(input: Event): boolean {
    const parsed = EventSchema.safeParse(input);
    if (!parsed.success) throw new Error('invalid_event');
    const event = parsed.data;
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM events WHERE id = ? OR source_key = ?')
        .all(event.id, event.source_key) as EventRow[];
      const payload = JSON.stringify(event.payload);
      if (existing.length) {
        const same = existing.length === 1 && existing.every(row =>
          row.source_key === event.source_key && row.project_id === event.project_id &&
          row.task_id === event.task_id && row.session_id === event.session_id &&
          row.occurred_at === event.occurred_at && row.payload === payload);
        if (!same) throw new Error('event_conflict');
        return false;
      }
      this.execute('INSERT INTO events(id, project_id, task_id, session_id, source_key, occurred_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [event.id, event.project_id, event.task_id, event.session_id, event.source_key, event.occurred_at, payload]);
      return true;
    });
  }

  eventCount(): number {
    return (this.db.prepare('SELECT count(*) AS count FROM events').get() as { count: number }).count;
  }
}
