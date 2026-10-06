import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { z } from 'zod';

/** Transport boundary only; implementations call the shared domain/Store. */
export interface LocalWebDomain {
  bootstrap(): unknown;
  task(id: string): { version: string } & Record<string, unknown>;
  registerProject(directory: string): Promise<unknown>;
  createTask(input: { name: string; project_id: string; setup_id: string; type?: string | undefined; size?: string | undefined }): Promise<unknown>;
  taskAction(id: string, action: string, input: Record<string, unknown>): Promise<unknown>;
  refreshPrices(): Promise<unknown>;
  chooseDirectory(): Promise<unknown>;
  importSetup?(): Promise<unknown>;
  chooseSession(taskId: string): Promise<unknown>;
  close?(): Promise<void>;
}
export interface LocalWebOptions { origin: string; domain: LocalWebDomain; metadataFile: string; uiRoot?: string }
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/);
const empty = z.strictObject({});
const createInput = z.strictObject({ name: z.string().trim().min(1).max(200), project_id: id, setup_id: id,
  type: z.enum(['feature', 'fix', 'infra', 'chore', 'docs', 'ci']).optional(), size: z.enum(['small', 'medium', 'large']).optional() });
const actionSchemas = {
  prepare: empty, apply: empty, ticket: empty, connect: z.strictObject({ source_handle: id }),
  observe: empty, pause: empty, rework: empty, recover: empty,
  'finish-success': z.strictObject({ criteria: z.array(id).max(256).optional() }),
  'finish-failed': empty, 'finish-abandoned': empty,
  release: z.strictObject({ external_session_stopped: z.literal(true) }),
};
const safeCodes = new Set(['unknown_task', 'unknown_project', 'unknown_setup', 'invalid_transition', 'task_not_assigned',
  'external_preparation_required', 'external_source_unsupported', 'external_operation_unsupported', 'external_surface_busy',
  'external_configuration_drift', 'external_stop_acknowledgement_required', 'external_preimage_unapproved', 'external_common_drift',
  'workflow_run_active', 'workflow_scope_revoked', 'native_source_unqualified', 'external_ticket_required', 'external_ticket_expired',
  'external_ticket_mismatch', 'external_native_context_unverified', 'external_collection_unsupported', 'criterion_mismatch',
  'criteria_not_met', 'deleted_identifier', 'invalid_project_root', 'git_baseline_unavailable', 'project_dirty',
  'external_connection_required', 'external_connection_unverified', 'external_ticket_invalid', 'external_ticket_used', 'external_freshness_unverified', 'external_context_mismatch', 'external_window_closed', 'invalid_criteria', 'invalid_ui_setup', 'ui_setup_conflict', 'binary_mismatch', 'external_native_binary_required', 'catalog_source_not_configured', 'catalog_unavailable', 'picker_unavailable', 'ui_state_changed', 'ui_action_uncertain',
  'ui_action_conflict', 'invalid_ui_request']);
export function localWebError(error: unknown): string {
  return error instanceof Error && safeCodes.has(error.message) ? error.message : 'local_operation_failed';
}
function sameSecret(input: string | undefined, expected: string): boolean {
  if (!input) return false;
  const actual = Buffer.from(input); const required = Buffer.from(expected);
  return actual.byteLength === required.byteLength && timingSafeEqual(actual, required);
}

/** No listening is done here. The entry binds 127.0.0.1 only; injection supports focused tests. */
export function createLocalWebServer(options: LocalWebOptions) {
  const url = new URL(options.origin);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/') throw new Error('invalid_local_origin');
  const app = Fastify({ logger: false, bodyLimit: 16384 });
  const csrf = randomBytes(32).toString('hex');
  const records = new Database(options.metadataFile);
  records.pragma('busy_timeout = 5000');
  records.exec(`CREATE TABLE IF NOT EXISTS web_actions (id TEXT PRIMARY KEY, request_hash TEXT NOT NULL,
    state TEXT NOT NULL, status INTEGER, response TEXT)`);
  let queue: Promise<void> = Promise.resolve();
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer')
      .header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (request.headers.host !== url.host || (request.headers.origin !== undefined && request.headers.origin !== options.origin)) {
      await reply.code(403).send({ error: 'local_origin_required' }); return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const token = request.headers['x-harness-csrf'];
      if (request.headers.origin !== options.origin || !sameSecret(typeof token === 'string' ? token : undefined, csrf)) await reply.code(403).send({ error: 'local_authorization_required' });
    }
  });
  app.setErrorHandler(async (error, _request, reply) => {
    const oversized = error instanceof Error && 'statusCode' in error && error.statusCode === 413;
    await reply.code(oversized ? 413 : 400).send({ error: oversized ? 'request_too_large' : localWebError(error) });
  });
  app.get('/api/bootstrap', () => ({ csrf, data: options.domain.bootstrap() }));
  app.get<{ Params: { id: string } }>('/api/tasks/:id', (request, reply) => {
    const task = options.domain.task(id.parse(request.params.id)); reply.header('ETag', task.version); return task;
  });
  const mutation = async (request: { body: unknown; url: string; headers: Record<string, unknown> },
    parse: (input: unknown) => unknown, execute: (input: unknown) => Promise<unknown>, taskId?: string) => {
    const key = z.uuid().parse(request.headers['idempotency-key']);
    const body: unknown = parse(request.body);
    const hash = createHash('sha256').update(JSON.stringify({ url: request.url, body })).digest('hex');
    let unlock: (() => void) | undefined;
    const previous = queue; queue = new Promise<void>(resolve => { unlock = resolve; }); await previous;
    try {
      // Re-read scope even on replay: deleted tasks must never return from cached responses.
      const task = taskId ? options.domain.task(taskId) : null;
      const old = records.prepare('SELECT * FROM web_actions WHERE id=?').get(key) as { request_hash: string; state: string; response: string; status: number } | undefined;
      if (old) {
        if (old.request_hash !== hash) throw new Error('ui_action_conflict');
        if (old.state === 'pending') throw new Error('ui_action_uncertain');
        const cached: unknown = JSON.parse(old.response);
        if (request.url === '/api/tasks' && old.status === 200 && cached && typeof cached === 'object' && 'id' in cached && typeof cached.id === 'string') options.domain.task(cached.id);
        return { status: old.status, result: cached };
      }
      if (task && request.headers['if-match'] !== task.version) throw new Error('ui_state_changed');
      records.prepare("INSERT INTO web_actions(id,request_hash,state) VALUES (?,?,'pending')").run(key, hash);
      let result: unknown; let status = 200;
      try { result = await execute(body); } catch (error) { result = { error: localWebError(error) }; status = 400; }
      records.prepare("UPDATE web_actions SET state='done',status=?,response=? WHERE id=?").run(status, JSON.stringify(result), key);
      return { status, result };
    } finally { unlock?.(); }
  };
  const addMutation = (route: string, schema: z.ZodType, execute: (input: unknown) => Promise<unknown>) => {
    app.post(route, async (request, reply) => {
      const value = await mutation(request, input => schema.parse(input), execute); await reply.code(value.status).send(value.result);
    });
  };
  addMutation('/api/projects', z.strictObject({ directory: z.string().min(1).max(4096).refine(p => !/[\0\r\n]/.test(p)) }),
    async input => options.domain.registerProject((input as { directory: string }).directory));
  addMutation('/api/project-picker', empty, async () => ({ selection: await options.domain.chooseDirectory() }));
  addMutation('/api/setup-picker', empty, async () => { if (!options.domain.importSetup) throw new Error('invalid_ui_setup'); return options.domain.importSetup(); });
  addMutation('/api/tasks', createInput, async input => options.domain.createTask(createInput.parse(input)));
  addMutation('/api/catalog/refresh', empty, async () => options.domain.refreshPrices());
  app.post<{ Params: { id: string; action: string } }>('/api/tasks/:id/:action', async (request, reply) => {
    const taskId = id.parse(request.params.id); const action = request.params.action;
    const schema = action === 'session-picker' ? empty : actionSchemas[action as keyof typeof actionSchemas];
    if (!schema) throw new Error('invalid_ui_request');
    try {
      const value = await mutation(request, input => schema.parse(input), async input => action === 'session-picker'
        ? { selection: await options.domain.chooseSession(taskId) } : options.domain.taskAction(taskId, action, input as Record<string, unknown>), taskId);
      await reply.code(value.status).send(value.result);
    } catch (error) {
      const code = localWebError(error); await reply.code(['ui_state_changed', 'ui_action_conflict', 'ui_action_uncertain'].includes(code) ? 409 : 400).send({ error: code });
    }
  });
  if (options.uiRoot) {
    const root = realpathSync(options.uiRoot);
    app.get('/', (_request, reply) => { reply.type('text/html'); return readFileSync(join(root, 'index.html')); });
    app.get<{ Params: { name: string } }>('/assets/:name', (request, reply) => {
      const name = request.params.name;
      if (!/^[a-zA-Z0-9._-]+\.(?:js|css|svg|woff2)$/.test(name)) return reply.code(404).send();
      const path = realpathSync(join(root, 'assets', name));
      if (!path.startsWith(root + sep)) return reply.code(404).send();
      reply.type(name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : 'font/woff2');
      return readFileSync(path);
    });
  }
  app.addHook('onClose', async () => { await options.domain.close?.(); records.close(); });
  return app;
}
