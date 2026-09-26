import type { Store } from '../../src/store.js';
export function seedLinkedTask(store: Store, ids: { projectId: string; taskId: string; sessionId: string }): void {
  store.execute('INSERT INTO projects(id) VALUES (?)', [ids.projectId]);
  store.execute('INSERT INTO tasks(id, project_id) VALUES (?, ?)', [ids.taskId, ids.projectId]);
  store.execute('INSERT INTO sessions(id, project_id, task_id) VALUES (?, ?, ?)', [ids.sessionId, ids.projectId, ids.taskId]);
}
