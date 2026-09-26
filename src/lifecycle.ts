import { randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { IdSchema, ProductVersionSchema, TaskMetadataSchema, TimestampSchema } from './contracts.js';
import type { Store } from './store.js';

export type TaskState = 'registered' | 'active' | 'paused' | 'finalized';
export type Outcome = 'success' | 'failed' | 'aborted';
export interface TaskRow {
  id: string; project_id: string; metadata: string; state: TaskState;
  registered_at: string; started_at: string | null; first_completed_at: string | null;
  finalized_at: string | null; first_success: number | null; generation: number;
  last_transition_at: string | null; first_assessed_at: string | null;
}
export type Clock = () => string;
export const utcNow: Clock = () => new Date().toISOString();

export class Lifecycle {
  constructor(private readonly store: Store, private readonly clock: Clock = utcNow) {}

  registerProject(id: string, root: string): void {
    IdSchema.parse(id);
    const localRoot = realpathSync(root);
    if (!statSync(localRoot).isDirectory()) throw new Error('invalid_project_root');
    this.store.transaction(() => {
      this.rejectDeleted('project', id);
      this.store.execute('INSERT INTO projects(id,local_root) VALUES (?,?)', [id, localRoot]);
    });
  }

  createTask(projectId: string, taskId: string, input: unknown): void {
    IdSchema.parse(projectId); IdSchema.parse(taskId);
    const metadata = TaskMetadataSchema.parse(input);
    const now = this.now();
    this.store.transaction(() => {
      this.rejectDeleted('task', taskId); this.rejectDeleted('project', projectId);
      if (!this.store.get('SELECT id FROM projects WHERE id = ?', [projectId])) throw new Error('unknown_project');
      this.store.execute('INSERT OR IGNORE INTO users(id) VALUES (?)', [metadata.assignee]);
      this.store.execute('INSERT INTO tasks(id,project_id,metadata,registered_at,last_transition_at) VALUES (?,?,?,?,?)',
        [taskId, projectId, JSON.stringify(metadata), now, now]);
    });
  }

  state(taskId: string): TaskState { return this.task(taskId).state; }

  task(taskId: string): TaskRow {
    const task = this.store.get<TaskRow>('SELECT * FROM tasks WHERE id = ?', [IdSchema.parse(taskId)]);
    if (!task) throw new Error('unknown_task');
    return task;
  }

  start(taskId: string): void { this.transition(taskId, 'registered', 'active'); }
  pause(taskId: string): void { this.transition(taskId, 'active', 'paused'); }
  resume(taskId: string): void { this.transition(taskId, 'paused', 'active'); }

  private transition(taskId: string, from: TaskState, to: TaskState): void {
    this.store.transaction(() => {
      const task = this.task(taskId);
      if (task.state !== from) throw new Error('invalid_transition');
      TaskMetadataSchema.parse(JSON.parse(task.metadata) as unknown);
      const now = this.now(task);
      this.store.execute('UPDATE tasks SET state = ?, started_at = COALESCE(started_at, ?), generation = generation + 1, last_transition_at = ? WHERE id = ?',
        [to, now, now, taskId]);
      if (to === 'active') {
        this.store.execute('INSERT INTO active_intervals(id,task_id,started_at) VALUES (?,?,?)', [randomUUID(), taskId, now]);
        if (from === 'registered') {
          this.store.execute('INSERT INTO attempts(id,task_id,kind,started_at) VALUES (?,?,?,?)', [randomUUID(), taskId, 'first', now]);
        }
      } else {
        this.store.execute('UPDATE active_intervals SET ended_at = ? WHERE task_id = ? AND ended_at IS NULL', [now, taskId]);
      }
    });
  }

  declareFirst(taskId: string): void {
    this.store.transaction(() => {
      const task = this.task(taskId);
      if (task.state !== 'active' || task.first_completed_at) throw new Error('invalid_transition');
      const now = this.now(task);
      this.store.execute('UPDATE tasks SET first_completed_at = ?, last_transition_at = ? WHERE id = ?', [now, now, taskId]);
      this.store.execute('UPDATE attempts SET ended_at = ? WHERE task_id = ? AND ended_at IS NULL', [now, taskId]);
    });
  }

  assessFirst(taskId: string, successful: boolean): void {
    z.boolean().parse(successful);
    this.store.transaction(() => {
      const task = this.task(taskId);
      if (task.state === 'finalized' || !task.first_completed_at || task.first_success !== null) throw new Error('invalid_transition');
      const now = this.now(task);
      this.store.execute('UPDATE tasks SET first_success = ?, first_assessed_at = ?, last_transition_at = ? WHERE id = ?', [successful ? 1 : 0, now, now, taskId]);
    });
  }

  rework(taskId: string): void {
    this.store.transaction(() => {
      const task = this.task(taskId);
      if (task.state !== 'active' || !task.first_completed_at) throw new Error('invalid_transition');
      const now = this.now(task);
      this.store.execute('UPDATE attempts SET ended_at = ? WHERE task_id = ? AND ended_at IS NULL', [now, taskId]);
      this.store.execute('INSERT INTO attempts(id,task_id,kind,started_at) VALUES (?,?,?,?)', [randomUUID(), taskId, 'rework', now]);
      this.store.execute('UPDATE tasks SET last_transition_at = ? WHERE id = ?', [now, taskId]);
    });
  }

  finalize(taskId: string, outcome: Outcome, criteriaMet: string[]): void {
    z.enum(['success', 'failed', 'aborted']).parse(outcome);
    z.array(IdSchema).refine(ids => new Set(ids).size === ids.length).parse(criteriaMet);
    this.store.transaction(() => {
      const task = this.task(taskId);
      if (task.state !== 'active' && task.state !== 'paused') throw new Error('invalid_transition');
      const metadata = TaskMetadataSchema.parse(JSON.parse(task.metadata) as unknown);
      if (criteriaMet.some(id => !metadata.criterion_ids.includes(id)) ||
          (outcome === 'success' && criteriaMet.length !== metadata.criterion_ids.length)) throw new Error('invalid_criteria');
      const now = this.now(task);
      this.store.execute('INSERT INTO outcomes(task_id,status,criteria_met,first_success,assessed_at) VALUES (?,?,?,?,?)',
        [taskId, outcome, JSON.stringify([...criteriaMet].sort()), task.first_success, now]);
      this.store.execute("UPDATE tasks SET state = 'finalized', finalized_at = ?, last_transition_at = ?, generation = generation + 1 WHERE id = ?", [now, now, taskId]);
      this.store.execute('UPDATE active_intervals SET ended_at = ? WHERE task_id = ? AND ended_at IS NULL', [now, taskId]);
      this.store.execute('UPDATE attempts SET ended_at = ? WHERE task_id = ? AND ended_at IS NULL', [now, taskId]);
    });
  }

  linkSession(taskId: string, sessionId: string, sourcePath: string, product: string, version: string): void {
    IdSchema.parse(sessionId); z.enum(['codex', 'claude_code']).parse(product); ProductVersionSchema.parse(version);
    const path = resolve(sourcePath);
    this.store.transaction(() => {
      const task = this.task(taskId);
      if (task.state === 'finalized') throw new Error('invalid_transition');
      this.rejectDeleted('session', sessionId);
      const metadata = TaskMetadataSchema.parse(JSON.parse(task.metadata) as unknown);
      if (metadata.product !== product) throw new Error('product_mismatch');
      this.store.execute('INSERT INTO sessions(id,project_id,task_id,source_path,product,product_version) VALUES (?,?,?,?,?,?)',
        [sessionId, task.project_id, taskId, path, product, version]);
    });
  }

  summary(taskId: string) {
    const task = this.task(taskId);
    const outcome = this.store.get<{ status: Outcome }>('SELECT status FROM outcomes WHERE task_id = ?', [taskId]);
    return { task_id: task.id, state: task.state, first_success: task.first_success === null ? null : Boolean(task.first_success),
      outcome: outcome?.status ?? null,
      rework_count: this.store.get<{ count: number }>("SELECT count(*) AS count FROM attempts WHERE task_id = ? AND kind = 'rework'", [taskId])?.count ?? 0 };
  }

  private rejectDeleted(kind: string, id: string): void {
    if (this.store.get('SELECT id FROM tombstones WHERE kind = ? AND id = ?', [kind, id])) throw new Error('deleted_identifier');
  }

  private now(task?: TaskRow): string {
    const now = new Date(TimestampSchema.parse(this.clock())).toISOString();
    if (task?.last_transition_at && Date.parse(now) < Date.parse(task.last_transition_at)) throw new Error('clock_regression');
    return now;
  }
}
