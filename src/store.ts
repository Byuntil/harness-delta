import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { Event } from './contracts.js';
import { EventSchema, TimestampSchema } from './contracts.js';

type EventRow = Omit<Event, 'payload'> & { payload: string };

export class Store {
  private readonly db: Database.Database;

  /** Database file path; ':memory:' for an in-memory store. */
  get filename(): string { return this.db.name; }

  constructor(path: string, private readonly receiptClock: () => string = () => new Date().toISOString()) {
    this.db = new Database(path);
    try {
      const version = this.db.pragma('user_version', { simple: true });
      const migrations = ['001_initial.sql', '002_lifecycle.sql', '003_assessment_time.sql', '004_managed_observation.sql', '005_otel_receiver.sql', '006_task_comparison.sql', '007_comparison_reports.sql', '008_file_exchange_source.sql', '009_file_exchange_import.sql', '010_team_snapshots.sql', '011_flexible_runtime.sql', '012_flexible_comparison_scope.sql', '013_flexible_scope_validation.sql', '014_codex_workflow.sql', '015_codex_workflow_child.sql', '016_claude_workflow.sql', '017_external_preparation.sql', '018_price_catalog.sql', '019_external_connection_contract.sql', '020_session_bindings.sql', '021_session_binding_forgets.sql', '022_session_binding_connect_receipt.sql', '023_binding_collection_control.sql'];
      if (typeof version !== 'number' || !Number.isInteger(version) || version < 0 || version > migrations.length) {
        throw new Error('unsupported_schema_version');
      }
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('busy_timeout = 5000');
      this.db.transaction(() => {
        for (let index = version; index < migrations.length; index++) {
          this.db.exec(readFileSync(new URL(`./migrations/${migrations[index]}`, import.meta.url), 'utf8'));
          this.db.pragma(`user_version = ${index + 1}`);
        }
      })();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  close(): void { this.db.close(); }

  execute(sql: string, params: unknown[]): void { this.db.prepare(sql).run(...params); }

  all<T>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  get<T>(sql: string, params: unknown[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  transaction<T>(action: () => T): T { return this.db.transaction(action)(); }

  /** Takes the writer lock at BEGIN, so a busy upgrade cannot fail after reads. */
  immediateTransaction<T>(action: () => T): T { return this.db.transaction(action).immediate(); }

  putEvent(input: import('zod').infer<typeof EventSchema>): boolean {
    const parsed = EventSchema.safeParse(input);
    if (!parsed.success) throw new Error('invalid_event');
    const event = parsed.data;
    return this.transaction(() => {
      if (event.payload.kind === 'usage' && 'schema_version' in event.payload) {
        const scope = this.get<{state:string;product:string|null}>("SELECT t.state,s.product FROM tasks t JOIN sessions s ON s.task_id=t.id AND s.project_id=t.project_id WHERE t.id=? AND t.project_id=? AND s.id=?", [event.task_id,event.project_id,event.session_id]);
        if (!scope || scope.state !== 'active') throw new Error('inactive_scope');
        if (scope.product && scope.product !== event.payload.product) throw new Error('scope_mismatch');
        if (event.payload.runtime_evidence_id !== null) {
          const runtime = this.get<{payload:string;task_id:string;session_id:string}>('SELECT payload,task_id,session_id FROM runtime_evidence WHERE id=?', [event.payload.runtime_evidence_id]);
          if (!runtime || runtime.task_id !== event.task_id || runtime.session_id !== event.session_id) throw new Error('runtime_scope_mismatch');
          const evidence = JSON.parse(runtime.payload) as {model:string|null;product:string;product_version:string;source:string;occurred_at:string};
          if (event.payload.attribution === 'verified' && (evidence.model !== event.payload.model || evidence.source === 'self_attested' || evidence.product !== event.payload.product || evidence.product_version !== event.payload.product_version || Date.parse(evidence.occurred_at) > Date.parse(event.occurred_at))) throw new Error('runtime_attribution_mismatch');
        }
      }
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
      const receipt = TimestampSchema.safeParse(this.receiptClock());
      if (!receipt.success) throw new Error('invalid_receipt_time');
      this.execute('INSERT INTO event_receipts(event_id,recorded_at) VALUES (?,?)', [event.id, new Date(receipt.data).toISOString()]);
      return true;
    });
  }

  eventCount(): number {
    return (this.db.prepare('SELECT count(*) AS count FROM events').get() as { count: number }).count;
  }
}
