import { createHash, randomUUID } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { constants, closeSync, fstatSync, mkdirSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { Lifecycle } from './lifecycle.js';
import { Store } from './store.js';
import { comparisonProtocol, protocolRow } from './comparison.js';
import { CodexWorkflowExecutionSchema } from './codex-workflow-adapter.js';
import { recoverCodexWorkflow } from './codex-workflow-journal.js';
import { ExternalTaskSetupSchema, buildExternalTaskSetup, createExternalTask, prepareExternalTask, issueExternalStartTicket, connectExternalTask, collectExternalTask, pauseExternalTask, externalTaskState, recordExternalTaskOutcome, externalTaskResult } from './external-session-service.js';
import type { ExternalTaskSetup } from './external-session-service.js';
import type { WorkflowAdapter } from './task-workflow.js';
import { releaseExternalWorkflow } from './external-session-workflow.js';
import { readOnlinePriceCatalogStatus, refreshOnlinePriceCatalog } from './price-catalog-online.js';
import { localWebError, type LocalWebDomain } from './local-web-server.js';

const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/);
const executionFields = CodexWorkflowExecutionSchema.shape;
/** Existing reviewed inputs only. No protocol, pricing or criterion defaults are invented here. */
export const LocalWebProfileSchema = z.strictObject({
  id: identifier, name: z.string().trim().min(1).max(200), setup: ExternalTaskSetupSchema,
  execution: z.strictObject({ binary: executionFields.binary, codex_home: executionFields.codex_home,
    hook_recorder: executionFields.hook_recorder, sandbox: executionFields.sandbox,
    timeout_ms: executionFields.timeout_ms, poll_ms: executionFields.poll_ms }),
});
export const LocalWebManifestSchema = z.strictObject({ schema_version: z.literal(1), profiles: z.array(LocalWebProfileSchema).max(64) });
export type LocalWebProfile = z.infer<typeof LocalWebProfileSchema>;
interface PrivateTask { id: string; name: string; profile_id: string; setup: string; startup: string | null; source: string | null; reason: string | null; }
interface Source { handle: string; label: string; path: string; session_id: string; }
interface Job { promise: Promise<void>; pauseRequested: boolean; }
export interface LocalWebDomainOptions {
  store: Store; metadataFile: string; profiles?: LocalWebProfile[];
  picker?: (kind: 'project' | 'session' | 'setup') => Promise<string | null>;
  adapterFactory?: (store: Store, execution: unknown) => WorkflowAdapter;
}
const runFile = promisify(execFile);
/** Constant AppleScript only; no browser-provided command or script is executed. */
export async function nativeLocalPicker(kind: 'project' | 'session' | 'setup'): Promise<string | null> {
  if (process.platform !== 'darwin') throw new Error('picker_unavailable');
  const script = kind === 'project' ? 'POSIX path of (choose folder with prompt "Choose the measurement project")'
    : kind === 'session' ? 'POSIX path of (choose file with prompt "Choose the exact new Codex session JSONL")'
      : 'POSIX path of (choose file with prompt "Choose an existing reviewed Harness Delta UI setup")';
  try { const result = await runFile('/usr/bin/osascript', ['-e', script], { timeout: 120000, maxBuffer: 8192 }); return result.stdout.trim() || null; }
  catch (error) { if (error instanceof Error && 'stderr' in error && String(error.stderr).includes('(-128)')) return null; throw new Error('picker_unavailable', { cause: error }); }
}
export function readLocalWebManifest(path: string) {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd); if (!stat.isFile() || stat.size > 1048576) throw new Error('invalid_ui_setup');
    return LocalWebManifestSchema.parse(JSON.parse(readFileSync(fd, 'utf8')) as unknown);
  } finally { if (fd !== undefined) closeSync(fd); }
}
/** Reads the current commit; it never creates a commit or changes the checkout. */
export function projectBaseline(directory: string): string {
  try {
    const value = execFileSync('git', ['-C', directory, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8', timeout: 5000, maxBuffer: 4096, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)) throw new Error(); return value;
  } catch { throw new Error('git_baseline_unavailable'); }
}

/** UI labels and private native handoffs stay outside the measurement Store. */
export function createLocalWebDomain(options: LocalWebDomainOptions): LocalWebDomain {
  const store = options.store; const life = new Lifecycle(store);
  mkdirSync(dirname(options.metadataFile), { recursive: true, mode: 0o700 });
  const privateDb = new Database(options.metadataFile);
  privateDb.pragma('busy_timeout = 5000');
  privateDb.exec(`CREATE TABLE IF NOT EXISTS web_profiles(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS web_tasks(id TEXT PRIMARY KEY,name TEXT NOT NULL,profile_id TEXT NOT NULL,setup TEXT NOT NULL,startup TEXT,source TEXT,reason TEXT);
    CREATE TABLE IF NOT EXISTS web_sources(handle TEXT PRIMARY KEY,task_id TEXT NOT NULL,payload TEXT NOT NULL)`);
  const jobs = new Map<string, Job>(); const picker = options.picker ?? nativeLocalPicker;
  const saveProfiles = (inputs: LocalWebProfile[]) => privateDb.transaction(() => {
    for (const input of inputs) {
      const profile = LocalWebProfileSchema.parse(input);
      // Replacing an existing definition would silently change a user's setup.
      const old = privateDb.prepare('SELECT payload FROM web_profiles WHERE id=?').get(profile.id) as { payload: string } | undefined;
      if (old && old.payload !== JSON.stringify(profile)) throw new Error('ui_setup_conflict');
      privateDb.prepare('INSERT OR IGNORE INTO web_profiles(id,payload) VALUES (?,?)').run(profile.id, JSON.stringify(profile));
    }
  })();
  saveProfiles(options.profiles ?? []);
  const profiles = () => (privateDb.prepare('SELECT payload FROM web_profiles ORDER BY rowid').all() as { payload: string }[]).map(p => LocalWebProfileSchema.parse(JSON.parse(p.payload) as unknown));
  const row = (id: string) => {
    life.task(id); // Deletion/CLI changes always win over the private cache.
    const result = privateDb.prepare('SELECT * FROM web_tasks WHERE id=?').get(id) as PrivateTask | undefined;
    if (!result) throw new Error('unknown_task'); return result;
  };
  const setupFor = (task: PrivateTask) => ExternalTaskSetupSchema.parse(JSON.parse(task.setup) as unknown);
  const profileFor = (id: string) => { const result = profiles().find(p => p.id === id); if (!result) throw new Error('unknown_setup'); return result; };
  const sourceFor = (task: PrivateTask) => task.source === null ? null : JSON.parse(task.source) as Source;
  const executionFor = (task: PrivateTask, operation: 'link' | 'collect', source: Source) => CodexWorkflowExecutionSchema.parse({
    ...profileFor(task.profile_id).execution, run_id: randomUUID(), operation, session_id: source.session_id, source_path: source.path,
  });
  const running = (id: string) => store.all<{ id: string; stop_requested: number }>("SELECT id,stop_requested FROM codex_workflow_runs WHERE task_id=? AND state='running'", [id]);
  const taskDto = (id: string) => {
    const record = row(id); const setup = setupFor(record); const state = externalTaskState(store, id); const task = life.task(id);
    const result = externalTaskResult(store, id); const runs = running(id); const active = runs.length > 0 || jobs.has(id);
    const finalized = task.state === 'finalized'; const connected = state.window.started_at !== null;
    const supported = setup.workflow.assignment.metadata.product !== 'claude_code';
    const ready = state.configuration_evidence === 'verified_at_preparation' && state.state !== 'released';
    const source = sourceFor(record); const startup = record.startup === null ? null : JSON.parse(record.startup) as { ticket_id: string; start_command: string };
    const reason = finalized ? 'finalized' : active ? 'observation_running' : !connected ? 'external_connection_required' : null;
    const action = (code: string, enabled: boolean, why: string | null = null) => ({ code, enabled, reason: enabled ? null : why });
    const actions = [
      action('apply', !finalized && !active && !ready, finalized ? 'finalized' : active ? 'workflow_run_active' : 'configuration_ready'),
      action('ticket', !finalized && !active && ready && state.window_status !== 'closed' && supported, !supported ? 'external_collection_unsupported' : finalized ? 'finalized' : active ? 'workflow_run_active' : 'external_preparation_required'),
      action('connect', !finalized && !active && startup !== null && ready && state.window_status !== 'closed' && supported, !supported ? 'external_collection_unsupported' : active ? 'workflow_run_active' : 'external_ticket_required'),
      action('observe', !finalized && !active && connected && source !== null && ready && state.window_status !== 'closed' && supported, reason ?? (state.window_status === 'closed' ? 'external_window_closed' : 'external_connection_required')),
      action('pause', !finalized && (active || task.state === 'active'), 'inactive_observation'),
      action('rework', !finalized && !active && connected && state.window_status !== 'closed', reason ?? 'external_window_closed'),
      action('finish-success', !finalized && !active && connected, reason),
      action('finish-failed', !finalized && !active && connected, reason),
      action('finish-abandoned', !finalized && !active && connected, reason),
      action('recover', runs.length > 0 && !jobs.has(id), 'inactive_observation'),
      action('release', !active && state.state !== 'released', 'workflow_run_active'),
    ];
    const version = '"' + createHash('sha256').update(JSON.stringify({ task, control: { revision: state.revision, window: state.window, configuration_evidence: state.configuration_evidence }, record, runs, ownJob: jobs.has(id) })).digest('hex') + '"';
    const measurementState = finalized ? 'measurement_ended' : active ? (state.state === 'measuring' ? 'active' : 'starting') : task.state === 'active' ? 'connected' : connected ? 'paused' : 'waiting_connection';
    const status = state.outcome ?? (measurementState === 'waiting_connection' ? 'draft' : measurementState);
    return { id, name: record.name, project_id: task.project_id, setup_id: record.profile_id, version, state: task.state, status,
      measurement: { state: measurementState, active_ms: result.time.active_ms, requests: result.cost?.event_count ?? null, window: state.window },
      outcome: state.outcome === null ? null : { status: state.outcome, assessed_at: result.outcome_at! }, attempt: state.rework_count + 1,
      preparation: { state: state.state, configuration_evidence: state.configuration_evidence, native_context_evidence: state.native_context_evidence,
        freshness_evidence: state.freshness_evidence, tool_use_evidence: state.tool_use_evidence, assigned_variant_id: state.assigned_variant_id },
      price: { partial_amount: result.cost?.partial_amount ?? null, currency: result.cost?.currency ?? 'USD', unpriced_events: result.cost?.unpriced_events ?? 0, basis: result.cost?.price_table_hash ?? null },
      criteria: setup.workflow.assignment.metadata.criterion_ids, actions, startup, source: source ? { handle: source.handle, label: source.label } : null,
      reason: record.reason === 'measurement_paused' ? null : record.reason ?? state.reason_code,
    };
  };
  const domain: LocalWebDomain = {
    bootstrap() {
      const allProfiles = profiles().filter(p => store.get<{status: string}>('SELECT status FROM comparison_protocols WHERE id=?', [p.setup.workflow.assignment.protocol_id])?.status === 'frozen' && store.get('SELECT id FROM projects WHERE id=?', [p.setup.workflow.assignment.project_id]));
      const projects = store.all<{ id: string; local_root: string }>('SELECT id,local_root FROM projects').map(p => {
        let baseline: string | null = null; try { baseline = projectBaseline(p.local_root); } catch { /* Show unavailable without creating a commit. */ }
        return { id: p.id, name: basename(p.local_root), directory: p.local_root, baseline, setup_ids: allProfiles.filter(s => s.setup.workflow.assignment.project_id === p.id).map(s => s.id) };
      });
      const setups = allProfiles.map(p => {
        const protocol = comparisonProtocol(store, protocolRow(store, p.setup.workflow.assignment.protocol_id));
        const strata = protocol.strata.filter(s => s.assignees.includes(p.setup.workflow.assignment.metadata.assignee));
        return { id: p.id, name: p.name, project_id: p.setup.workflow.assignment.project_id, arm_a: protocol.variant_ids[0], arm_b: protocol.variant_ids[1],
          types: [...new Set(strata.flatMap(s => s.types))], sizes: [...new Set(strata.flatMap(s => s.sizes))], support: 'Codex 0.160.0 CLI root only; actual tool use unavailable' };
      });
      const tasks = (privateDb.prepare('SELECT id FROM web_tasks ORDER BY rowid DESC').all() as { id: string }[])
        .filter(t => store.get('SELECT 1 FROM tasks WHERE id=?', [t.id])).map(t => taskDto(t.id));
      return { projects, setups, tasks, catalog: readOnlinePriceCatalogStatus(store) };
    },
    task: taskDto,
    registerProject(directory) {
      const root = realpathSync(resolve(directory)); projectBaseline(root);
      const previous = store.get<{ id: string }>('SELECT id FROM projects WHERE local_root=?', [root]);
      if (previous) return Promise.resolve({ id: previous.id });
      const id = randomUUID(); life.registerProject(id, root); return Promise.resolve({ id });
    },
    createTask(input) {
      const profile = profileFor(input.setup_id); const existing = store.get<{ local_root: string }>('SELECT local_root FROM projects WHERE id=?', [input.project_id]);
      if (!existing || profile.setup.workflow.assignment.project_id !== input.project_id) throw new Error('unknown_project');
      const base = buildExternalTaskSetup(store, { id: profile.id, setup: profile.setup }, { projectId: input.project_id });
      const setup: ExternalTaskSetup = { ...base, workflow: { ...base.workflow, assignment: { ...base.workflow.assignment,
        code_base_commit: projectBaseline(existing.local_root), metadata: { ...base.workflow.assignment.metadata,
          ...(input.type ? { type: input.type } : {}), ...(input.size ? { expected_size: input.size } : {}) } } } };
      const created = createExternalTask(store, setup, false); const id = created.state.task_id;
      privateDb.prepare('INSERT INTO web_tasks(id,name,profile_id,setup) VALUES (?,?,?,?)').run(id, input.name, profile.id, JSON.stringify(created.setup));
      return Promise.resolve(taskDto(id));
    },
    async chooseDirectory() { return picker('project'); },
    async importSetup() { const path = await picker('setup'); if (path === null) return { cancelled: true }; saveProfiles(readLocalWebManifest(path).profiles); return { imported: true }; },
    async chooseSession(taskId) {
      row(taskId); const selected = await picker('session'); if (selected === null) return null;
      const path = realpathSync(selected); const match = basename(path).match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.jsonl$/i);
      if (!match) throw new Error('native_source_unqualified');
      // Filename identity only. Session contents are read exclusively by the scoped domain collector.
      const source: Source = { handle: randomUUID(), label: basename(path), path, session_id: z.uuid().parse(match[1]) };
      privateDb.prepare('INSERT INTO web_sources(handle,task_id,payload) VALUES (?,?,?)').run(source.handle, taskId, JSON.stringify(source));
      return { handle: source.handle, label: source.label };
    },
    async taskAction(id, action, input) {
      const record = row(id); const setup = setupFor(record);
      if (action === 'prepare' || action === 'apply') prepareExternalTask(store, setup, action === 'apply');
      else if (action === 'ticket') {
        const ticket = issueExternalStartTicket(store, setup);
        privateDb.prepare('UPDATE web_tasks SET startup=?,reason=NULL WHERE id=?').run(JSON.stringify({ ticket_id: ticket.ticket_id, start_command: ticket.start_command }), id);
      } else if (action === 'connect') {
        const stored = privateDb.prepare('SELECT payload FROM web_sources WHERE handle=? AND task_id=?').get(input.source_handle, id) as { payload: string } | undefined;
        if (!stored || record.startup === null) throw new Error('external_ticket_required');
        const source = JSON.parse(stored.payload) as Source; const execution = executionFor(record, 'link', source);
        const startup = JSON.parse(record.startup) as { ticket_id: string };
        await connectExternalTask(store, setup, execution, startup.ticket_id, options.adapterFactory?.(store, execution));
        privateDb.prepare('UPDATE web_tasks SET source=?,startup=NULL,reason=NULL WHERE id=?').run(JSON.stringify(source), id);
      } else if (action === 'observe') {
        if (jobs.has(id) || running(id).length) throw new Error('workflow_run_active');
        const source = sourceFor(record); if (!source) throw new Error('external_connection_required');
        const execution = executionFor(record, 'collect', source);
        // Foreground core collection runs asynchronously; the mutation queue remains free for pause.
        const job: Job = { promise: Promise.resolve(), pauseRequested: false };
        jobs.set(id, job);
        job.promise = collectExternalTask(store, setup, execution, options.adapterFactory?.(store, execution))
          .then(() => { privateDb.prepare('UPDATE web_tasks SET reason=NULL WHERE id=?').run(id); })
          .catch((error: unknown) => { const reason = job.pauseRequested && error instanceof Error && error.message === 'workflow_scope_revoked' ? 'measurement_paused' : localWebError(error); privateDb.prepare('UPDATE web_tasks SET reason=? WHERE id=?').run(reason, id); })
          .finally(() => { jobs.delete(id); });

      } else if (action === 'pause') { const job = jobs.get(id); if (job) job.pauseRequested = true; pauseExternalTask(store, id); await job?.promise; }
      else if (action === 'recover') {
        if (jobs.has(id)) throw new Error('workflow_run_active');
        for (const run of running(id)) recoverCodexWorkflow(store, run.id); pauseExternalTask(store, id);
      } else if (action === 'release') releaseExternalWorkflow(store, id, input.external_session_stopped === true);
      else if (action === 'rework' || action.startsWith('finish-')) {
        const choice = action === 'rework' ? 'rework' : action === 'finish-success' ? 'success' : action === 'finish-failed' ? 'failed' : action === 'finish-abandoned' ? 'aborted' : null;
        if (choice === null) throw new Error('invalid_ui_request');
        recordExternalTaskOutcome(store, id, choice, choice === 'success' ? z.array(identifier).parse(input.criteria ?? setup.workflow.assignment.metadata.criterion_ids) : []);
      } else throw new Error('invalid_ui_request');
      return taskDto(id);
    },
    async refreshPrices() { return refreshOnlinePriceCatalog(store); },
    async close() { for (const [id,job] of jobs) { job.pauseRequested = true; if (store.get('SELECT id FROM tasks WHERE id=?',[id])) pauseExternalTask(store, id); } await Promise.all([...jobs.values()].map(j => j.promise)); privateDb.close(); },
  };
  return domain;
}
