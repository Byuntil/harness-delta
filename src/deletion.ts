import { z } from 'zod';
import { IdSchema, TimestampSchema } from './contracts.js';
import { utcNow, type Clock } from './lifecycle.js';
import type { Store } from './store.js';

export class Deletion {
  constructor(private readonly store: Store, private readonly clock: Clock = utcNow) {}

  isDeleted(kind: 'task' | 'project' | 'session', id: string): boolean {
    return Boolean(this.store.get('SELECT id FROM tombstones WHERE kind = ? AND id = ?', [kind, id]));
  }

  deleteTask(taskId: string): void {
    IdSchema.parse(taskId);
    this.store.transaction(() => {
      if (this.isDeleted('task', taskId)) return;
      if (!this.store.get('SELECT id FROM tasks WHERE id = ?', [taskId])) throw new Error('unknown_task');
      for (const session of this.store.all<{ id: string }>('SELECT id FROM sessions WHERE task_id = ?', [taskId])) this.tombstone('session', session.id);
      this.tombstone('task', taskId);
      this.store.execute('DELETE FROM tasks WHERE id = ?', [taskId]);
    });
  }

  deleteProject(projectId: string): void {
    IdSchema.parse(projectId);
    this.store.transaction(() => {
      if (this.isDeleted('project', projectId)) return;
      if (!this.store.get('SELECT id FROM projects WHERE id = ?', [projectId])) throw new Error('unknown_project');
      for (const task of this.store.all<{ id: string }>('SELECT id FROM tasks WHERE project_id = ?', [projectId])) this.deleteTask(task.id);
      this.tombstone('project', projectId);
      this.store.execute('DELETE FROM projects WHERE id = ?', [projectId]);
    });
  }

  configureRetention(projectId: string, days: number): void {
    IdSchema.parse(projectId); z.number().int().min(1).max(365000).parse(days);
    if (!this.store.get('SELECT id FROM projects WHERE id = ?', [projectId])) throw new Error('unknown_project');
    this.store.execute('UPDATE projects SET retention_days = ? WHERE id = ?', [days, projectId]);
  }

  applyRetention(projectId: string, now: string): number {
    IdSchema.parse(projectId); TimestampSchema.parse(now);
    return this.store.transaction(() => {
      const project = this.store.get<{ retention_days: number | null }>('SELECT retention_days FROM projects WHERE id = ?', [projectId]);
      if (!project) throw new Error('unknown_project');
      if (project.retention_days === null) throw new Error('retention_not_configured');
      const cutoff = Date.parse(now) - project.retention_days * 86400000;
      const tasks = this.store.all<{ id: string; finalized_at: string }>("SELECT id,finalized_at FROM tasks WHERE project_id = ? AND state = 'finalized'", [projectId])
        .filter(task => Date.parse(task.finalized_at) <= cutoff);
      for (const task of tasks) this.deleteTask(task.id);
      return tasks.length;
    });
  }

  private tombstone(kind: string, id: string): void {
    this.store.execute('INSERT OR IGNORE INTO tombstones(kind,id,deleted_at) VALUES (?,?,?)', [kind, id, TimestampSchema.parse(this.clock())]);
  }
}
