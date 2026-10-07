import { randomUUID } from 'node:crypto';
import { afterEach, expect, test } from 'vitest';
import { localWebFixture } from './helpers/local-web-fixture.js';
import { createSessionBindingService } from '../src/session-binding-service.js';
import type { BindingUsageRecord, SessionBindingProvider, VerifiedSessionIdentity } from '../src/session-binding-contract.js';
import { Deletion } from '../src/deletion.js';
import { selectTaskPriceTable } from '../src/price-catalog-selection.js';
import { externalContract } from '../src/external-session-contract.js';
import { ExternalTaskSetupSchema, prepareExternalTask } from '../src/external-session-service.js';
import { codexWorkflowFixture } from './helpers/codex-workflow-fixture.js';
import { codexWorkflowProfileId } from '../src/codex-workflow-journal.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function fixture() {
  const f = localWebFixture(); const domain = f.create();
  cleanups.push(async () => { await domain.close?.(); f.cleanup(); });
  const task = await domain.createTask({ name: 'Synthetic family', project_id: 'project-1', setup_id: f.profile.id }) as { id: string };
  await domain.taskAction(task.id, 'apply', {});
  // The domain owns the generated setup; read only its isolated private fixture DB.
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(f.metadataFile); const row = db.prepare('SELECT setup FROM web_tasks WHERE id=?').get(task.id) as { setup: string }; db.close();
  const setup = JSON.parse(row.setup) as typeof f.profile.setup;
  let now = new Date(Date.now() + 100).toISOString();
  const identities = new Map<string, VerifiedSessionIdentity>();
  const relations = new Map<string, VerifiedSessionIdentity[]>();
  const records = new Map<string, BindingUsageRecord[]>();
  let reads = 0; let resolves = 0;
  const identity = (parentSessionId: string | null = null) => {
    const value: VerifiedSessionIdentity = { product: 'codex', productVersion: '0.160.0', sessionId: randomUUID(),
      sourceRef: f.newRoot().path, sourceIdentity: randomUUID(), cwd: f.project,
      identityEvidenceId: randomUUID(), parentSessionId, createdAt: now };
    identities.set(value.sessionId, value); records.set(value.sessionId, []); return value;
  };
  let current = identity();
  const provider: SessionBindingProvider = { product: 'codex',
    capabilities: () => ({ currentIdentity: 'native_hook', ancestry: 'verified_relations', usage: 'own_requests', productionSupported: false, maxDepth: 8, reasons: ['qualification_required'] }),
    resolveCurrent: () => { resolves++; return Promise.resolve(current); },
    discoverChildren: parent => Promise.resolve({ children: (relations.get(parent.sessionId) ?? []).map(value => ({ parentSessionId: parent.sessionId, identity: value, relationEvidenceId: value.identityEvidenceId })), gaps: [] }),
    readUsage: (session, cursor) => { reads++; const all = records.get(session.sessionId)!; return Promise.resolve({ records: all.slice(cursor === null ? 0 : Number(cursor)), cursor: String(all.length), gaps: [] }); },
  };
  const providers = [provider];
  const service = createSessionBindingService({ store: f.store, providers, setupFor: () => setup, clock: () => now });
  const usage = (session: VerifiedSessionIdentity, requestId = randomUUID()) => {
    now = new Date(Date.parse(now) + 100).toISOString();
    const observed = (value: number) => ({ status: 'observed' as const, value, reason: null });
    const record: BindingUsageRecord = { requestId, sessionId: session.sessionId, occurredAt: now, turnId: 'turn', effort: 'high',
      payload: { schema_version: 2, kind: 'usage', product: 'codex', product_version: '0.160.0', model: 'model-a', epoch: 'epoch', attribution: 'verified',
        input_total: observed(10), cached_input: observed(2), output_total: observed(3), reasoning_output: observed(1),
        billing_components: [{ kind: 'ordinary_input', reading: observed(8) }, { kind: 'cache_read', reading: observed(2) }, { kind: 'output', reading: observed(3) }] } };
    records.get(session.sessionId)!.push(record); return record;
  };
  const connect = () => service.connect(task.id, 'codex', { receipt: randomUUID() });
  return { ...f, domain, id: task.id, service, provider, providers, identity, relations, records, usage, connect,
    current: () => current, setCurrent: (value: VerifiedSessionIdentity) => { current = value; },
    advance:()=>{now=new Date(Date.parse(now)+1).toISOString();}, reads: () => reads, resolves: () => resolves };
}

test('connect baselines old usage, replay is idempotent, multiple children and a descendant aggregate', async () => {
  const f = await fixture(); f.usage(f.current());
  expect(await f.connect()).toMatchObject({ status: 'connected', automatic_children: true, cost_coverage: 'partial' });
  expect(f.store.eventCount()).toBe(0);
  const reads = f.reads(); expect(await f.connect()).toMatchObject({ status: 'already_connected' }); expect(f.reads()).toBe(reads);
  const a = f.identity(f.current().sessionId); const b = f.identity(f.current().sessionId); const descendant = f.identity(a.sessionId);
  f.relations.set(f.current().sessionId, [a, b]); f.relations.set(a.sessionId, [descendant]);
  f.usage(f.current()); f.usage(a); f.usage(b); f.usage(descendant);
  await f.service.tick(f.id); await f.service.tick(f.id);
  expect(f.store.eventCount()).toBe(4); expect(f.service.status(f.id)).toMatchObject({ roots: 1, children: 3, requests: 4, cost_coverage: 'partial' });
});

test('pause and same/new root restart baseline excluded interval and preserve assignment/window/price', async () => {
  const f = await fixture(); await f.connect(); f.usage(f.current()); await f.service.tick(f.id);
  const assignment = f.store.get('SELECT * FROM comparison_assignments WHERE task_id=?', [f.id]); const price = selectTaskPriceTable(f.store, f.id); const window = externalContract(f.store, f.id);
  f.service.pause(f.id); const reads = f.reads(); await f.service.tick(f.id); expect(f.reads()).toBe(reads);
  expect(f.service.status(f.id).gaps).toContain('unobserved_interval');
  f.usage(f.current()); await f.connect(); await f.service.tick(f.id); expect(f.store.eventCount()).toBe(1);
  f.setCurrent(f.identity()); f.usage(f.current()); await f.connect(); f.usage(f.current()); await f.service.tick(f.id);
  expect(f.store.eventCount()).toBe(2); expect(f.service.status(f.id)).toMatchObject({ roots: 2 });
  expect(f.store.get('SELECT * FROM comparison_assignments WHERE task_id=?', [f.id])).toEqual(assignment);
  expect(selectTaskPriceTable(f.store, f.id)).toEqual(price);
  expect(externalContract(f.store, f.id)).toEqual(window);
});

test('global native request conflict rolls back child batch and cursor', async () => {
  const f = await fixture(); await f.connect(); const request = randomUUID(); f.usage(f.current(), request); await f.service.tick(f.id);
  const child = f.identity(f.current().sessionId); f.relations.set(f.current().sessionId, [child]); f.usage(child, request);
  await expect(f.service.tick(f.id)).rejects.toThrow('binding_request_conflict'); expect(f.store.eventCount()).toBe(1);
});

test('deletion and revoked generation during asynchronous read prevent queued writes', async () => {
  const f = await fixture(); await f.connect(); f.usage(f.current());
  const original = f.provider.readUsage.bind(f.provider);
  f.provider.readUsage = async (...args) => { const result = await original(...args); f.service.pause(f.id); return result; };
  await expect(f.service.tick(f.id)).rejects.toThrow('binding_scope_revoked'); expect(f.store.eventCount()).toBe(0);
  new Deletion(f.store).deleteTask(f.id); const resolves = f.resolves(); await expect(f.connect()).rejects.toThrow('unknown_task'); expect(f.resolves()).toBe(resolves);
  expect(f.store.all('SELECT * FROM session_bindings')).toEqual([]);
});

test('rejects ambiguous ancestry, mismatched cwd and unqualified production before source reads', async () => {
  const f = await fixture(); f.current().cwd = '/synthetic/unrelated'; await expect(f.connect()).rejects.toThrow('binding_identity_mismatch'); expect(f.reads()).toBe(0);
  f.current().cwd = f.project; await f.connect(); const child = f.identity('other-parent'); f.relations.set(f.current().sessionId, [child]);
  await expect(f.service.tick(f.id)).rejects.toThrow('binding_relation_invalid');
  const native = codexWorkflowFixture(codexWorkflowProfileId, 'functional_pilot'); cleanups.push(() => { native.cleanup(); return Promise.resolve(); });
  const setup = ExternalTaskSetupSchema.parse({ ...f.profile.setup, workflow: native.input });
  prepareExternalTask(native.store, setup, true);
  const service = createSessionBindingService({ store: native.store, providers: [f.provider], setupFor: () => setup });
  const resolves = f.resolves(); await expect(service.connect(native.input.assignment.task_id, 'codex', { receipt: randomUUID() })).rejects.toThrow('binding_source_unqualified'); expect(f.resolves()).toBe(resolves);
});


test('a second platform root preserves the same logical task arm, price and window', async () => {
  const f = await fixture(); await f.connect(); const request = randomUUID();
  f.usage(f.current(), request); await f.service.tick(f.id);
  const assignment = f.store.get('SELECT * FROM comparison_assignments WHERE task_id=?', [f.id]);
  const price = selectTaskPriceTable(f.store, f.id); const window = externalContract(f.store, f.id);
  const member = { ...f.identity(), product: 'claude_code' as const, productVersion: '2.1.291' };
  const candidate: SessionBindingProvider = { ...f.provider, product: 'claude_code', resolveCurrent: () => Promise.resolve(member) };
  f.providers.push(candidate);
  await f.service.connect(f.id, 'claude_code', { receipt: randomUUID() });
  const record = f.usage(member, request);
  record.payload.product = 'claude_code'; record.payload.product_version = '2.1.291';
  await f.service.tick(f.id); await f.service.tick(f.id);
  expect(f.service.status(f.id)).toMatchObject({ roots: 2, requests: 2, cost_coverage: 'partial' });
  expect(f.store.get('SELECT * FROM comparison_assignments WHERE task_id=?', [f.id])).toEqual(assignment);
  expect(selectTaskPriceTable(f.store, f.id)).toEqual(price);
  expect(externalContract(f.store, f.id)).toEqual(window);
  expect(f.store.all<{product: string}>('SELECT identity FROM session_bindings')).toHaveLength(2);
});

test('session rows and sum preserve missing, observed zero, partial readings and unpriced usage without adding cache/reasoning counters', async () => {
  const f = await fixture(); await f.connect();
  expect(f.service.status(f.id).sessions[0]).toMatchObject({requests:null,input_total:{status:'missing',value:null},partial_amount:null});
  const child=f.identity(f.current().sessionId);f.relations.set(f.current().sessionId,[child]);
  const zero=f.usage(f.current());zero.payload.model='synthetic-model';zero.payload.input_total={status:'observed',value:0,reason:null};zero.payload.cached_input={status:'observed',value:0,reason:null};zero.payload.output_total={status:'observed',value:0,reason:null};zero.payload.reasoning_output={status:'observed',value:0,reason:null};
  if('schema_version' in zero.payload)zero.payload.billing_components=zero.payload.billing_components.map(c=>({...c,reading:{status:'observed',value:0,reason:null}}));
  const absent=f.usage(child);absent.payload.input_total={status:'missing',value:null,reason:'not_available'};absent.payload.model='no-matched-price';
  if('schema_version' in absent.payload)absent.payload.billing_components=[{kind:'output',reading:absent.payload.output_total}];
  await f.service.tick(f.id);f.advance();const binding=f.service.status(f.id);
  expect(binding.sessions[0]).toMatchObject({requests:1,input_total:{status:'observed',value:0},output_total:{status:'observed',value:0},partial_amount:'0'});
  expect(binding.sessions[1]).toMatchObject({requests:1,input_total:{status:'missing',value:null,statuses:['missing']},output_total:{status:'observed',value:3},partial_amount:null,unpriced_events:1});
  expect(binding.summary).toMatchObject({requests:2,input_total:{status:'partial',value:0,statuses:['missing','observed']},output_total:{status:'observed',value:3},partial_amount:'0',unpriced_events:1,complete_cost:null});
});
