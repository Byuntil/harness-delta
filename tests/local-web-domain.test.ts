import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { localWebFixture } from './helpers/local-web-fixture.js';
import { projectBaseline } from '../src/local-web-domain.js';
import { createLocalWebServer } from '../src/local-web-server.js';
import { Lifecycle } from '../src/lifecycle.js';
import { Deletion } from '../src/deletion.js';
import { selectTaskPriceTable } from '../src/price-catalog-selection.js';

test('real Store bridge prepares inactive, persists labels, reads HEAD, respects CLI pause and deleted scope', async () => {
  const f = localWebFixture(); let domain = f.create();
  try {
    const head = projectBaseline(f.project);
    const created = await domain.createTask({ name: 'Synthetic visible task', project_id: 'project-1', setup_id: f.profile.id });
    const task = created as { id: string; version: string; status: string };
    expect(task.status).toBe('draft'); expect(new Lifecycle(f.store).state(task.id)).toBe('registered');
    expect(f.store.all('SELECT * FROM active_intervals')).toHaveLength(0);
    expect(f.store.get<{ code_base_commit: string }>('SELECT code_base_commit FROM comparison_preregistrations WHERE task_id=?', [task.id])?.code_base_commit).toBe(head);
    expect(JSON.stringify(f.store.all('SELECT * FROM tasks'))).not.toContain('Synthetic visible task');
    await domain.close?.(); domain = f.create();
    expect(domain.task(task.id)).toMatchObject({ name: 'Synthetic visible task', version: task.version });
    await domain.taskAction(task.id, 'apply', {});
    await domain.taskAction(task.id, 'ticket', {});
    const ticket = domain.task(task.id).startup as { ticket_id: string }; const source = f.sourceFor(ticket.ticket_id); f.appendUsage(source);
    f.pick(source.path); const selected = await domain.chooseSession(task.id) as { handle: string };
    await domain.taskAction(task.id, 'connect', { source_handle: selected.handle });
    expect(f.store.eventCount()).toBe(0);
    const before = domain.task(task.id).version; new Lifecycle(f.store).pause(task.id);
    expect(domain.task(task.id).version).not.toBe(before);
    new Deletion(f.store).deleteTask(task.id);
    expect(() => domain.task(task.id)).toThrow('unknown_task');
    expect(await domain.bootstrap()).toMatchObject({ tasks: [] });
  } finally { await domain.close?.(); f.cleanup(); }
});

test('HTTP observation returns promptly, pause settles, human rework retains arm/window and success stays final', async () => {
  const f = localWebFixture(); const domain = f.create(); const origin = 'http://127.0.0.1:4318';
  const app = createLocalWebServer({ origin, domain, metadataFile: f.metadataFile });
  try {
    const created = await domain.createTask({ name: 'Synthetic result task', project_id: 'project-1', setup_id: f.profile.id }) as { id: string };
    const id = created.id;
    await domain.taskAction(id, 'apply', {}); await domain.taskAction(id, 'ticket', {});
    const ticket = domain.task(id).startup as { ticket_id: string }; const source = f.sourceFor(ticket.ticket_id);
    f.pick(source.path); const selection = await domain.chooseSession(id) as { handle: string };
    await domain.taskAction(id, 'connect', { source_handle: selection.handle });
    const baseline = domain.task(id); const csrf = (await app.inject({ url: '/api/bootstrap', headers: { host: '127.0.0.1:4318' } })).json<{ csrf: string }>().csrf;
    const post = async (action: string, body: unknown = {}) => app.inject({ method: 'POST', url: `/api/tasks/${id}/${action}`, payload: JSON.stringify(body),
      headers: { host: '127.0.0.1:4318', origin, 'content-type': 'application/json', 'x-harness-csrf': csrf, 'idempotency-key': randomUUID(), 'if-match': domain.task(id).version } });
    const start = Date.now(); const observing = await post('observe'); expect(observing.statusCode).toBe(200); expect(Date.now() - start).toBeLessThan(1000);
    // Wait only for the exact collector's guarded baseline; never use fixture source contents as evidence.
    await expect.poll(() => f.store.get<{ source_identity: string | null }>("SELECT source_identity FROM codex_workflow_runs WHERE task_id=? AND operation='collect' ORDER BY rowid DESC LIMIT 1", [id])?.source_identity, { timeout: 2000 }).toBeTruthy();
    const controlVersion = domain.task(id).version;
    f.appendUsage(source); await expect.poll(() => f.store.eventCount(), { timeout: 2000 }).toBe(1);
    expect(domain.task(id).version).toBe(controlVersion);
    expect((await post('finish-success')).json()).toMatchObject({ error: 'workflow_run_active' });
    expect((await post('pause')).statusCode).toBe(200);
    expect(domain.task(id)).toMatchObject({ measurement: { state: 'paused' }, reason: null });
    expect((await post('rework')).statusCode).toBe(200);
    expect(domain.task(id)).toMatchObject({ attempt: 2, preparation: { assigned_variant_id: (baseline.preparation as {assigned_variant_id: string}).assigned_variant_id }, measurement: { window: (baseline.measurement as { window: unknown }).window } });
    expect((await post('finish-success')).statusCode).toBe(200);
    expect(domain.task(id)).toMatchObject({ status: 'success', outcome: { status: 'success' } });
    expect((await post('rework')).json()).toMatchObject({ error: 'invalid_transition' });
    expect(f.store.eventCount()).toBe(1);
  } finally { await app.close(); f.cleanup(); }
}, 10000);

test('deleting a sibling preserves retained task reads and price pin while protocol gates stay closed', async () => {
  const f = localWebFixture(); const domain = f.create();
  try {
    const create = () => domain.createTask({ name: 'Synthetic retained task', project_id: 'project-1', setup_id: f.profile.id }) as Promise<{ id: string }>;
    const deleted = await create();
    await domain.taskAction(deleted.id, 'release', { external_session_stopped: true });
    const retained = await create(); const id = retained.id;
    await domain.taskAction(id, 'apply', {}); await domain.taskAction(id, 'ticket', {});
    const ticket = domain.task(id).startup as { ticket_id: string }; const source = f.sourceFor(ticket.ticket_id);
    f.pick(source.path); const selected = await domain.chooseSession(id) as { handle: string };
    await domain.taskAction(id, 'connect', { source_handle: selected.handle });
    const pin = selectTaskPriceTable(f.store, id); const price = domain.task(id).price;
    new Deletion(f.store).deleteTask(deleted.id);
    expect(selectTaskPriceTable(f.store, id)).toEqual(pin);
    expect(domain.task(id)).toMatchObject({ id, price });
    expect(await domain.bootstrap()).toMatchObject({ setups: [], tasks: [{ id, price }] });
    expect(() => create()).toThrow('protocol_not_active');
    await domain.taskAction(id, 'observe', {});
    await expect.poll(() => domain.task(id).reason).toBe('local_operation_failed');
    expect(f.store.all("SELECT id FROM codex_workflow_runs WHERE task_id=? AND operation='collect'", [id])).toEqual([]);
    await domain.taskAction(id, 'finish-success', {});
    expect(domain.task(id)).toMatchObject({ status: 'success', outcome: { status: 'success' } });
    expect(await domain.bootstrap()).toMatchObject({ tasks: [{ id, status: 'success', price }] });
    expect(() => domain.task(deleted.id)).toThrow('unknown_task');
  } finally { await domain.close?.(); f.cleanup(); }
});
