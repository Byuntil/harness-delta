import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run, sessionHint } from '../scripts/connect.mjs';

const session = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const origin = 'http://127.0.0.1:4319';
const support = 'Server-reported source support';
function fixture() {
  const task = { id: 'task-a', project_id: 'project-a', setup_id: 'setup-a', version: '"' + 'b'.repeat(64) + '"', state: 'registered',
    actions: [{ code: 'connect', enabled: true }], startup: { ticket_id: 'private-ticket', start_command: 'PRIVATE INSTRUCTIONS' }, source: null,
    measurement: { state: 'waiting_connection', window: { started_at: null, ends_at: null } },
    preparation: { state: 'connected', configuration_evidence: 'verified_at_preparation', native_context_evidence: 'unverified', freshness_evidence: 'unverified', assigned_variant_id: 'arm-b' } };
  const data = { projects: [{ id: 'project-a', directory: '/private/project' }], setups: [{ id: 'setup-a', project_id: 'project-a', support }], tasks: [task] };
  const calls = [];
  let selected = session;
  let persist = true;
  const transport = async (url, options) => {
    calls.push({ url, ...options });
    let body;
    if (url.endsWith('/api/bootstrap')) body = { csrf: 'a'.repeat(64), data };
    else if (options.method === 'GET') body = structuredClone(task);
    else if (url.endsWith('/session-picker')) body = { selection: { handle: 'source-a', label: `rollout-${selected}.jsonl` } };
    else if (url.endsWith('/connect')) {
      assert.deepEqual(JSON.parse(options.body), { source_handle: 'source-a' });
      assert.equal(options.headers['X-Harness-CSRF'], 'a'.repeat(64));
      assert.equal(options.headers.Origin, origin);
      assert.equal(options.headers['If-Match'], task.version);
      assert.match(options.headers['Idempotency-Key'], /^[a-f0-9-]{36}$/);
      if (persist) Object.assign(task, { state: 'active', startup: null, source: { handle: 'source-a', label: `rollout-${selected}.jsonl` },
        measurement: { state: 'connected', window: { started_at: new Date(Date.now() - 1000).toISOString(), ends_at: new Date(Date.now() + 3600000).toISOString() } },
        preparation: { state: 'connected', configuration_evidence: 'verified_at_preparation', native_context_evidence: 'native_developer_context_observed', freshness_evidence: 'fresh_root_after_ticket', assigned_variant_id: 'arm-b' } });
      body = task;
    } else throw new Error('unexpected_route');
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const options = { origin, product: 'codex', project: 'project-a', task: 'task-a', session, role: 'root' };
  return { task, data, calls, transport, options, select(id) { selected = id; }, persist(value) { persist = value; } };
}
const posts = f => f.calls.filter(c => c.method === 'POST');
test('inspect is read-only and excludes private startup, labels and paths', async () => {
  const f = fixture(); const result = await run('inspect', { origin, product: 'codex' }, f.transport);
  assert.equal(posts(f).length, 0); assert.equal(result.status, 'selection_required');
  assert.equal(result.tasks[0].task_id, 'task-a');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|private|directory|csrf|start_command/);
});
test('explicit choice is required with multiple tasks, never inferred from cwd', async () => {
  const f = fixture(); f.data.tasks.push({ ...f.task, id: 'task-b' });
  await assert.rejects(run('connect', { origin, product: 'codex', session }, f.transport), /selection_required/);
  assert.equal(posts(f).length, 0);
});
test('ticket-started selected root is connected and duplicate invocation is read-only', async () => {
  const f = fixture(); const first = await run('connect', f.options, f.transport);
  assert.equal(first.status, 'connected'); assert.equal(first.scope, 'selected_session');
  assert.equal(first.assigned_variant_id, 'arm-b'); assert.equal(first.collection_active, false);
  const count = posts(f).length;
  const second = await run('connect', f.options, f.transport);
  assert.equal(second.status, 'already_connected'); assert.equal(posts(f).length, count);
});
test('ordinary session without ticket, unsupported Claude, child and unknown setup mapping do not mutate', async () => {
  for (const change of ['ticket', 'claude', 'child', 'capability']) {
    const f = fixture();
    if (change === 'ticket') f.task.startup = null;
    if (change === 'claude') f.options.product = 'claude_code';
    if (change === 'child') f.options.role = 'child';
    if (change === 'capability') f.data.setups = [];
    await assert.rejects(run('connect', f.options, f.transport)); assert.equal(posts(f).length, 0);
  }
});
test('source UUID mismatch fails before connect; durable proof is required after POST', async () => {
  const f = fixture(); f.select(other);
  await assert.rejects(run('connect', f.options, f.transport), /selected_session_mismatch/);
  assert.equal(posts(f).length, 1);
  const g = fixture(); g.persist(false);
  await assert.rejects(run('connect', g.options, g.transport), /connection_unverified/);
});
test('same identity in another task blocks reassignment; finalized or stale proof cannot replay', async () => {
  const f = fixture(); await run('connect', f.options, f.transport);
  f.data.tasks.push({ ...f.task, id: 'task-b' });
  await assert.rejects(run('connect', { ...f.options, task: 'task-b' }, f.transport), /session_task_conflict/);
  f.data.tasks.pop(); f.task.state = 'finalized';
  await assert.rejects(run('connect', f.options, f.transport), /task_closed/);
  f.task.state = 'active'; f.task.preparation.native_context_evidence = 'observed_for_previous_revision';
  await assert.rejects(run('connect', f.options, f.transport), /connection_unverified/);
});
test('transport failures are scrubbed; redirect and remote URL fail closed', async () => {
  const f = fixture();
  await assert.rejects(run('inspect', { origin, product: 'codex' }, () => { throw new Error('SECRET path and prompt'); }), /^Error: local_ui_unavailable$/);
  await assert.rejects(run('inspect', { origin, product: 'codex' }, () => new Response('', { status: 302 })), /local_ui_request_failed/);
  await assert.rejects(run('inspect', { origin: 'https://example.com', product: 'codex' }, f.transport), /invalid_origin/);
  assert.equal(f.calls.length, 0);
});
test('identity hint reads one host variable only and does not attest a current binding', () => {
  assert.deepEqual(sessionHint('codex', { CODEX_THREAD_ID: session, CODEX_SESSION_ID: other, SECRET: 'secret' }), { session_id: session, identity_basis: 'host_environment_hint' });
  assert.deepEqual(sessionHint('claude_code', { CLAUDE_SESSION_ID: session }), { session_id: null, identity_basis: 'unavailable' });
  assert.deepEqual(sessionHint('codex', { CODEX_THREAD_ID: 'bad' }), { session_id: null, identity_basis: 'unavailable' });
});

test('configuration drift and final release/expiry race invalidate successful-looking proof', async () => {
  const f = fixture(); await run('connect', f.options, f.transport);
  f.task.preparation.state = 'configuration_changed'; f.task.preparation.configuration_evidence = 'unverified';
  await assert.rejects(run('connect', f.options, f.transport), /connection_unverified/);
  for (const race of ['released', 'expired', 'assignment', 'setup']) {
    const g = fixture();
    const transport = async (url, options) => {
      const reply = await g.transport(url, options);
      if (url.endsWith('/connect')) {
        if (race === 'released') g.task.preparation.state = 'released';
        if (race === 'expired') g.task.measurement.window.ends_at = new Date(Date.now() - 1000).toISOString();
        if (race === 'assignment') g.task.preparation.assigned_variant_id = 'arm-a';
        if (race === 'setup') g.task.setup_id = 'setup-b';
      }
      return reply;
    };
    await assert.rejects(run('connect', g.options, transport), /connection_unverified/);
  }
});

test('malformed proof fields cannot be coerced into valid IDs; failed POST is uncertain', async () => {
  const f = fixture(); await run('connect', f.options, f.transport);
  delete f.task.preparation.assigned_variant_id;
  await assert.rejects(run('connect', f.options, f.transport), /unsupported_ui_contract/);
  f.task.preparation.assigned_variant_id = 'arm-b'; delete f.task.source.handle;
  await assert.rejects(run('connect', f.options, f.transport), /startup_ticket_required/);
  const g = fixture();
  await assert.rejects(run('connect', g.options, async (url, options) => {
    if (options.method === 'POST') throw new Error('PRIVATE CONTENT');
    return g.transport(url, options);
  }), /^Error: ui_action_uncertain$/);
});
test('picker race cannot overwrite disabled observation or changed startup/configuration', async () => {
  for (const race of ['observing', 'ticket', 'configuration', 'version']) {
    const f = fixture();
    await assert.rejects(run('connect', f.options, async (url, options) => {
      const reply = await f.transport(url, options);
      if (url.endsWith('/session-picker')) {
        if (race === 'observing') f.task.actions = [{ code: 'connect', enabled: false, reason: 'workflow_run_active' }];
        if (race === 'ticket') f.task.startup = null;
        if (race === 'configuration') f.task.preparation.configuration_evidence = 'unverified';
        if (race === 'version') f.task.version = '"' + 'c'.repeat(64) + '"';
      }
      return reply;
    }), /ui_state_changed/);
    assert.equal(posts(f).length, 1);
  }
});
test('CLI version labels are informational; the server validates actual connection support', async () => {
  for (const label of ['Codex future-version CLI root', null, 'unverified']) {
    const f = fixture(); f.data.setups[0].support = label;
    const inspected = await run('inspect', { origin, product: 'codex' }, f.transport);
    assert.equal(inspected.support, 'server_validation_required');
    assert.equal((await run('connect', f.options, f.transport)).status, 'connected');
  }
  const rejected = fixture(); rejected.data.setups[0].support = 'Codex future-version CLI root';
  await assert.rejects(run('connect', rejected.options, async (url, options) => {
    if (url.endsWith('/connect')) return new Response(JSON.stringify({ error: 'native_source_unqualified' }), { status: 400 });
    return rejected.transport(url, options);
  }), /native_source_unqualified/);
});
