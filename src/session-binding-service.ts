import { CodexSessionBindingProvider } from './session-binding-codex.js';
import { addTokens } from './contracts.js';
import { captureObservedCostInput, projectObservedCost } from './observed-cost-report.js';
import { projectCatalogCost } from './catalog-cost-report.js';
import { readPriceBasis } from './price-catalog-store.js';
import type { UsageEvent } from './flexible-contracts.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Lifecycle, utcNow, type Clock } from './lifecycle.js';
import { parseTaskMetadata, parseProtocol } from './flexible-contracts.js';
import { externalContract, bindingCollectionControl } from './external-session-contract.js';
import { assertExternalPrepared } from './external-session-workflow.js';
import { bindConfigurationToSession } from './config-confirmation.js';
import { putUsageWithEvidence, recordObservationGap } from './runtime-history.js';
import { selectTaskPriceTable } from './price-catalog-selection.js';
import { comparisonProtocol, protocolRow } from './comparison.js';
import { BindingUsageRecordSchema, bindingIdentityKey, CurrentIdentityRequestSchema, VerifiedSessionIdentitySchema,
  type BindingProduct, type CurrentIdentityRequest, type SessionBindingProvider, type VerifiedSessionIdentity } from './session-binding-contract.js';
import type { CandidateScope } from './nested-candidate.js';
import type { Store } from './store.js';
import { assertBindingQualification, bindingQualificationOwnerLive, noteBindingQualificationTransition, checkBindingQualificationIdentity, checkBindingQualificationRecord, type BindingQualificationLease } from './session-binding-qualification-lease.js';
import type { ExternalTaskSetup } from './external-session-service.js';
import { assertHumanPilotScope, checkHumanPilotIdentity, type HumanPilotScope } from './session-binding-human-pilot.js';

interface BindingRow { session_id: string; task_id: string; root_id: string; identity: string;
  relation_evidence_id: string | null; connect_receipt: string | null; cursor: string | null; observed_since: string; generation: number; state: string; gaps: string }
export interface SessionBindingServiceOptions {
  store: Store; providers: SessionBindingProvider[]; setupFor(taskId: string): ExternalTaskSetup; clock?: Clock;
  providersForTask?(taskId: string, deletedProjectRoot?: string): SessionBindingProvider[];
  qualificationLease?: BindingQualificationLease;
  humanPilot?: HumanPilotScope;
  syntheticProviderForTask?(provider: SessionBindingProvider, taskId: string): boolean;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identityFor = (row: BindingRow) => VerifiedSessionIdentitySchema.parse(JSON.parse(row.identity) as unknown);
const gapCodes = new Set(['qualification_required', 'unsupported_history', 'missing_usage', 'missing_runtime', 'incomplete_request',
  'binding_depth_limit', 'binding_family_limit', 'binding_usage_incomplete', 'source_changed', 'source_unavailable', 'incomplete', 'partial_tail',
  'binding_ancestry_unverified', 'binding_partial_usage', 'binding_future_usage', 'binding_unobserved_context', 'candidate_unsupported_history', 'unobserved_interval', 'late_linked_member']);
const cleanGaps = (values: string[]) => [...new Set(values.map(code => gapCodes.has(code) ? code : 'binding_usage_incomplete'))];

/** Production admission is code-owned. Existing launch/ticket profiles do not
 * qualify ordinary hook-bound sessions; provider/browser assertions cannot lift it. */
export function bindingSourceSupported(store: Store, taskId: string): boolean {
  const task = new Lifecycle(store).task(taskId);
  const metadata = parseTaskMetadata(JSON.parse(task.metadata) as unknown);
  const assignment = store.get<{ protocol_id: string }>('SELECT protocol_id FROM comparison_assignments WHERE task_id=?', [taskId]);
  return metadata.product === 'synthetic' && !!assignment && comparisonProtocol(store, protocolRow(store, assignment.protocol_id)).purpose === 'synthetic_validation';
}

export function createSessionBindingService(options: SessionBindingServiceOptions) {
  if(options.qualificationLease&&options.humanPilot)throw new Error('binding_pilot_scope_invalid');
  const { store } = options; const clock = options.clock ?? utcNow; const life = new Lifecycle(store, clock);
  const rows = (taskId: string) => store.all<BindingRow>('SELECT * FROM session_bindings WHERE task_id=? ORDER BY rowid', [taskId]);
  const providerFor = (product: BindingProduct, taskId: string) => {
    const provider = (options.providersForTask?.(taskId) ?? options.providers).find(p => p.product === product);
    if (!provider) throw new Error('binding_provider_unavailable'); return provider;
  };
  // Ordinary admission is independent of test ownership. Only explicitly
  // injected providers may use the synthetic protocol's validation authority.
  const sourceSupported = (taskId: string, product: BindingProduct) => {
    const provider = providerFor(product, taskId);
    return bindingSourceSupported(store, taskId) &&
      (options.providers.includes(provider) || options.syntheticProviderForTask?.(provider, taskId) === true);
  };
  let forgetting: Promise<void> | undefined;
  const flushForgotten = (): Promise<void> => {
    if (forgetting) return forgetting;
    forgetting = (async () => {
      for (const row of store.all<{product: BindingProduct;native_session_id: string;task_id: string;project_root: string}>('SELECT * FROM session_binding_forgets')) {
        try {
          const provider = (options.providersForTask?.(row.task_id, row.project_root) ?? options.providers).find(p => p.product === row.product);
          if (!provider?.forgetSession) throw new Error('binding_provider_unavailable');
          await provider.forgetSession(row.native_session_id);
          store.execute('DELETE FROM session_binding_forgets WHERE product=? AND native_session_id=?', [row.product, row.native_session_id]);
        } catch {
          // Keep retryable metadata cleanup durable. Deletion/tombstone fences
          // revoke collection immediately, independently of provider availability.
          store.execute("UPDATE session_binding_forgets SET reason_code='binding_forget_pending' WHERE product=? AND native_session_id=?", [row.product, row.native_session_id]);
        }
      }
    })().finally(() => { forgetting = undefined; });
    return forgetting;
  };
  const authorize = (taskId: string, active = false, generation?: number) => {
    const task = life.task(taskId);
    if (store.get("SELECT 1 FROM tombstones WHERE (kind='task' AND id=?) OR (kind='project' AND id=?)", [taskId, task.project_id])) throw new Error('deleted_identifier');
    if (task.state === 'finalized' || active && task.state !== 'active' || generation !== undefined && task.generation !== generation) throw new Error('binding_scope_revoked');
    const setup = options.setupFor(taskId);
    assertExternalPrepared(store, taskId, setup.workflow, setup.preparation, clock);
    const contract = externalContract(store, taskId);
    if (!contract) throw new Error('external_contract_required');
    const control = bindingCollectionControl(store,taskId);
    if(control?.revoked_at)throw new Error('binding_scope_revoked');
    if ((!control || options.qualificationLease) && contract.ends_at && Date.parse(clock()) >= Date.parse(contract.ends_at)) throw new Error('external_window_closed');
    if (options.qualificationLease) assertBindingQualification(options.qualificationLease, store, taskId);
    else if(options.humanPilot)assertHumanPilotScope(options.humanPilot,store,taskId,providerFor(parseTaskMetadata(JSON.parse(life.task(taskId).metadata) as unknown).product as BindingProduct,taskId));
    else if (!bindingSourceSupported(store, taskId)) throw new Error('binding_source_unqualified');
    return task;
  };
  const authorizeConnection = (taskId:string,generation?:number) => {
    const task=authorize(taskId,false,generation);
    // A failed pause can leave lifecycle state active while its durable
    // collection fence is stopped. Recover the pause before reconnecting.
    if(task.state==='active'&&store.get("SELECT 1 FROM external_preparations WHERE task_id=? AND state='stopped'",[taskId]))throw new Error('binding_scope_revoked');
    return task;
  };
  const checkIdentity = (taskId: string, input: VerifiedSessionIdentity) => {
    const value = VerifiedSessionIdentitySchema.parse(input); const task = life.task(taskId);
    const root = store.get<{ local_root: string }>('SELECT local_root FROM projects WHERE id=?', [task.project_id]);
    const metadata = parseTaskMetadata(JSON.parse(task.metadata) as unknown);
    if (value.cwd !== root?.local_root || metadata.product !== 'synthetic' && value.productVersion !== options.setupFor(taskId).workflow.product_version) throw new Error('binding_identity_mismatch');
    if (store.get("SELECT 1 FROM tombstones WHERE kind='session' AND id=?", [value.sessionId])) throw new Error('deleted_identifier');
    const old = store.get<{ task_id: string; parent_id: string | null }>('SELECT task_id,parent_id FROM sessions WHERE id=?', [value.sessionId]);
    if (old && (old.task_id !== taskId || old.parent_id !== value.parentSessionId)) throw new Error('binding_session_conflict');
    const bound = store.get<BindingRow>('SELECT * FROM session_bindings WHERE session_id=?', [value.sessionId]);
    if (bound && bindingIdentityKey(identityFor(bound)) !== bindingIdentityKey(value)) throw new Error('binding_identity_mismatch');
    if (old && !bound) throw new Error('binding_session_conflict');
    checkBindingQualificationIdentity(options.qualificationLease, store, taskId, value, false);
    if(options.humanPilot)checkHumanPilotIdentity(options.humanPilot,store,taskId,value);
    return value;
  };
  const bind = (taskId: string, value: VerifiedSessionIdentity, rootId: string, relation: string | null, generation: number) => {
    const old = store.get<BindingRow>('SELECT * FROM session_bindings WHERE session_id=?', [value.sessionId]);
    if (old) {
      if (old.root_id !== rootId || old.relation_evidence_id !== relation) throw new Error('binding_relation_invalid'); return;
    }
    const task = life.task(taskId); const confirmation = store.get<{ id: string }>('SELECT id FROM comparison_confirmations WHERE task_id=? ORDER BY rowid DESC LIMIT 1', [taskId]);
    if (!confirmation) throw new Error('configuration_confirmation_required');
    store.execute('INSERT INTO sessions(id,project_id,task_id,parent_id,source_path,product,product_version) VALUES (?,?,?,?,?,?,?)',
      [value.sessionId, task.project_id, taskId, value.parentSessionId, null, parseTaskMetadata(JSON.parse(task.metadata) as unknown).product === 'synthetic' ? 'synthetic' : value.product, value.productVersion]);
    bindConfigurationToSession(store, confirmation.id, value.sessionId);
    store.execute("INSERT INTO session_bindings(session_id,task_id,root_id,identity,relation_evidence_id,observed_since,generation,state) VALUES (?,?,?,?,?,?,?,'observing')",
      [value.sessionId, taskId, rootId, JSON.stringify(value), relation, clock(), generation]);
  };
  const scopeFor = (taskId: string, rootId: string): CandidateScope => ({
    taskId, projectId: life.task(taskId).project_id, allowedRootTurnIds: ['binding-observation'],
    sessions: rows(taskId).filter(r => r.root_id === rootId).map(row => {
      const value = identityFor(row);
      return { sessionId: value.sessionId, rootSessionId: rootId, parentSessionId: value.parentSessionId,
        sourceId: value.sessionId, product: value.product, nativeSessionId: value.nativeMapping?.nativeSessionId ?? value.sessionId,
        processId: value.nativeMapping?.processId ?? null, agentId: value.nativeMapping?.agentId ?? null };
    }),
  });
  const authorizeObservation = (taskId: string, row: BindingRow) => {
    const task=authorize(taskId,true,row.generation);
    const current=store.get<BindingRow>('SELECT * FROM session_bindings WHERE session_id=?',[row.session_id]);
    if(!current||current.state!=='observing'||current.generation!==row.generation||current.identity!==row.identity||current.cursor!==row.cursor)throw new Error('binding_scope_revoked');
    return task;
  };
  const read = async (taskId: string, row: BindingRow, baseline: boolean) => {
    authorizeObservation(taskId,row); const value = identityFor(row); const provider = providerFor(value.product, taskId);
    if(options.humanPilot)checkHumanPilotIdentity(options.humanPilot,store,taskId,value);
    if(options.humanPilot&&baseline) {
      // Baselines also need a metadata-only family preflight. Initial connect
      // and resume must not read a root body before noticing rejected members.
      const discovered=await provider.discoverChildren(value);authorizeObservation(taskId,row);
      if(discovered.gaps.length)throw new Error('binding_pilot_family_scope');
      for(const child of discovered.children) {
        const identity=checkIdentity(taskId,child.identity);
        if(child.parentSessionId!==value.sessionId||identity.parentSessionId!==value.sessionId||!child.relationEvidenceId)throw new Error('binding_pilot_family_scope');
        const descendants=await provider.discoverChildren(identity);authorizeObservation(taskId,row);
        if(descendants.children.length||descendants.gaps.length)throw new Error('binding_pilot_family_scope');
      }
    }
    const batch = await provider.readUsage(value, baseline ? null : row.cursor, scopeFor(taskId, row.root_id), { baseline });
    authorizeObservation(taskId,row);
    if (typeof batch.cursor !== 'string' || batch.cursor.length > 6 * 1024 * 1024 || batch.records.length > 65536 || (batch.excludedRecords?.length ?? 0) > 65536) throw new Error('binding_usage_invalid');
    const records = batch.records.map(record => BindingUsageRecordSchema.parse(record));
    const excluded = (batch.excludedRecords ?? []).map(record => BindingUsageRecordSchema.parse(record));
    for (const record of [...records,...excluded]) if (record.sessionId !== value.sessionId || record.payload.product !== value.product || record.payload.product_version !== value.productVersion || Date.parse(record.occurredAt) > Date.parse(clock())) throw new Error('binding_usage_invalid');
    store.immediateTransaction(() => {
      const task = authorizeObservation(taskId,row);
      for (const record of excluded) checkBindingQualificationRecord(options.qualificationLease, store, taskId, record, true);
      if (baseline) for (const record of records) checkBindingQualificationRecord(options.qualificationLease, store, taskId, record, true);
      if (!baseline) for (const record of records) {
        if (record.sessionId !== value.sessionId || record.payload.product !== value.product || record.payload.product_version !== value.productVersion || Date.parse(record.occurredAt) > Date.parse(clock())) throw new Error('binding_usage_invalid');
        if (Date.parse(record.occurredAt) < Date.parse(row.observed_since)) continue;
        const key = hash(['binding-request-v1', value.product, record.requestId]);
        const fingerprint = hash(record);
        const old = store.get<{ fingerprint: string }>('SELECT fingerprint FROM binding_requests WHERE request_key=?', [key]);
        if (old) { if (old.fingerprint !== fingerprint) throw new Error('binding_request_conflict'); continue; }
        // Check requests seen in other collector lanes and versions as well.
        if (store.get("SELECT 1 FROM runtime_evidence r LEFT JOIN session_bindings b ON b.session_id=r.session_id WHERE json_extract(r.payload,'$.request_id')=? AND (json_extract(r.payload,'$.product')=? OR (json_extract(r.payload,'$.product')='synthetic' AND (b.identity IS NULL OR json_extract(b.identity,'$.product')=?)))", [record.requestId, value.product, value.product])) throw new Error('binding_request_conflict');
        checkBindingQualificationRecord(options.qualificationLease, store, taskId, record);
        const measuredProduct = parseTaskMetadata(JSON.parse(task.metadata) as unknown).product === 'synthetic' ? 'synthetic' as const : value.product;
        const runtimeId = hash(['binding-runtime', key]);
        const runtime = { id: runtimeId, task_id: taskId, session_id: value.sessionId, turn_id: record.turnId, request_id: record.requestId,
          model: record.payload.model, effort: record.effort, product: measuredProduct, product_version: value.productVersion,
          source: 'product_log' as const, occurred_at: record.occurredAt, recorded_at: clock(), boundary: 'request' as const };
        putUsageWithEvidence(store, { id: key, source_key: key, task_id: taskId, project_id: task.project_id, session_id: value.sessionId,
          occurred_at: record.occurredAt, payload: { ...record.payload, product: measuredProduct, runtime_evidence_id: runtimeId } }, runtime);
        store.execute('INSERT INTO binding_requests(request_key,event_id,fingerprint) VALUES (?,?,?)', [key, key, fingerprint]);
      }
      const gaps = cleanGaps([...z.array(z.string()).parse(JSON.parse(row.gaps) as unknown), ...batch.gaps]);
      if (gaps.length) recordObservationGap(store, taskId, value.sessionId, row.observed_since, clock(), 'incomplete', clock());
      store.execute('UPDATE session_bindings SET cursor=?,gaps=? WHERE session_id=?', [batch.cursor, JSON.stringify(gaps), value.sessionId]);
    });
  };
  const status = (taskId: string) => {
    const task = life.task(taskId); const all = rows(taskId);
    const gaps = cleanGaps(all.flatMap(row => z.array(z.string()).parse(JSON.parse(row.gaps) as unknown)));
    const assignment=store.get<{protocol_id:string}>('SELECT protocol_id FROM comparison_assignments WHERE task_id=?',[taskId]);
    const protocol=assignment?parseProtocol(JSON.parse(protocolRow(store,assignment.protocol_id).settings) as unknown):null;
    const tableId=protocol?.schema_version===2?protocol.price_table_id:null;
    const capture=tableId?captureObservedCostInput(store,taskId,tableId,clock(),'output-only-v1'):null;
    const keys=new Set(store.all<{event_id:string}>('SELECT r.event_id FROM binding_requests r JOIN events e ON e.id=r.event_id WHERE e.task_id=?',[taskId]).map(r=>r.event_id));
    const eligible=(capture?.events??[]).filter(e=>keys.has(e.id));
    const total=(events:UsageEvent[],field:'input_total'|'output_total')=>{
      const readings=events.map(e=>e.payload[field]);const observed=readings.filter(r=>r.status==='observed');
      const statuses=[...new Set(readings.map(r=>r.status))].sort();
      return {status:readings.length&&observed.length===readings.length?'observed':observed.length?'partial':'missing',
        value:observed.length?addTokens(observed.map(r=>r.value)):null,statuses,
        reasons:[...new Set(readings.flatMap(r=>r.reason?[r.reason]:[]))].sort()};
    };
    const summarize=(events:UsageEvent[])=>{
      const priced=capture?(tableId&&store.get('SELECT price_table_id FROM price_catalog_bases WHERE price_table_id=?',[tableId])?
        projectCatalogCost(events,readPriceBasis(store,tableId),taskId,clock(),'output-only-v1',{referenceBinding:true,runtimeEvidence:capture.runtimeEvidence}):
        projectObservedCost(events,capture.report.price_table,taskId,clock(),'output-only-v1',capture.runtimeEvidence)):null;
      return {requests:events.length||null,input_total:total(events,'input_total'),output_total:total(events,'output_total'),
        partial_amount:priced?.partial_amount??null,
        compatibility_unverified_partial_amount:priced?.compatibility_unverified_partial_amount??null,
        legacy_unverified_partial_amount:priced?.legacy_unverified_partial_amount??null,
        compatibility:priced?.compatibility??null,unpriced_events:priced?.unpriced_events??0,
        currency:priced?.currency??null,price_table_id:tableId,cost_coverage:'partial' as const,complete_cost:null};
    };
    return { state: all.some(row => row.state === 'observing' && row.generation === task.generation) && task.state === 'active' ? 'observing' : all.length ? 'stopped' : 'unconnected',
      roots: all.filter(row => identityFor(row).parentSessionId === null).length, children: all.filter(row => identityFor(row).parentSessionId !== null).length,
      sessions: all.map(row => {
        const identity = identityFor(row); const metadata = identity.agentMetadata;
        const events = eligible.filter(e => e.session_id === row.session_id);
        return { session_id: row.session_id, parent_session_id: identity.parentSessionId, identity_basis: 'native_metadata_receipt',
          agent_metadata: metadata?.source === 'claude_hook' ? { source: metadata.source, agent_type: metadata.agentType } : metadata ?? null,
          models: [...new Set(events.flatMap(e => e.payload.model === null ? [] : [e.payload.model]))].sort(), ...summarize(events) };
      }),
      summary:summarize(eligible),
      requests: store.get<{ count: number }>('SELECT count(*) AS count FROM binding_requests r JOIN events e ON e.id=r.event_id WHERE e.task_id=?', [taskId])?.count ?? 0,
      gaps, cost_coverage: 'partial' as const, complete_cost: null, inference: false };
  };
  const resumeAvailable = (taskId: string) => {
    const roots = rows(taskId).filter(r => identityFor(r).parentSessionId === null);
    return roots.length === 1 && CurrentIdentityRequestSchema.safeParse({receipt:roots[0]!.connect_receipt}).success;
  };
  const pause = (taskId: string) => {
    const all = rows(taskId);
    // Collection fences do not depend on a successful timestamp/gap write.
    // A clock error remains an error; never invent an interval endpoint.
    store.immediateTransaction(()=>{
      store.execute("UPDATE session_bindings SET state='stopped',cursor=NULL WHERE task_id=?",[taskId]);
      store.execute("UPDATE external_preparations SET state='stopped' WHERE task_id=?", [taskId]);
    });
    for(const row of all)store.execute('UPDATE session_bindings SET gaps=? WHERE session_id=?',[JSON.stringify(cleanGaps([...z.array(z.string()).parse(JSON.parse(row.gaps) as unknown),'unobserved_interval'])),row.session_id]);
    if (life.state(taskId) === 'active') {
      for (const row of all.filter(row => row.state === 'observing')) recordObservationGap(store, taskId, row.session_id, row.observed_since, clock(), 'incomplete', clock());
      life.pause(taskId);
      noteBindingQualificationTransition(options.qualificationLease, store, taskId);
    }
  };
  const connect = async (taskId: string, product: BindingProduct, request: CurrentIdentityRequest, expectedRoot?: VerifiedSessionIdentity): Promise<ReturnType<typeof status> & {status:string;session_id:string;automatic_children:boolean;role?:'child'}> => {
      await flushForgotten();
      if (options.qualificationLease && !bindingQualificationOwnerLive(options.qualificationLease)) throw new Error('binding_qualification_live_root_required');
      const before = authorizeConnection(taskId); const provider = providerFor(product, taskId); const input = CurrentIdentityRequestSchema.parse(request);
      if (options.qualificationLease || options.humanPilot && provider instanceof CodexSessionBindingProvider) {
        if (!(provider instanceof CodexSessionBindingProvider)) throw new Error('binding_qualification_scope_invalid');
        const root=rows(taskId).find(r=>identityFor(r).parentSessionId===null);
        provider.assertRootReceipt(input,root?.session_id??null);
      }
      // An injected dependency is used only inside an explicitly synthetic
      // protocol. Native manifest providers remain gated even in that workspace.
      if (!options.qualificationLease && !options.humanPilot && !sourceSupported(taskId, product)) throw new Error('binding_source_unqualified');
      const pinned = rows(taskId).find(row => row.connect_receipt === input.receipt && identityFor(row).parentSessionId === null && identityFor(row).product === product);
      const boundRoot = expectedRoot ?? (pinned ? identityFor(pinned) : undefined);
      const resolved = boundRoot && pinned && 'revalidateBound' in provider && provider.revalidateBound ? await provider.revalidateBound(input, boundRoot) : await provider.resolveCurrent(input);
      authorizeConnection(taskId, before.generation);
      const value = checkIdentity(taskId, resolved);
      if (expectedRoot && bindingIdentityKey(value) !== bindingIdentityKey(expectedRoot)) throw new Error('binding_identity_mismatch');
      if (value.product !== product) throw new Error('binding_identity_mismatch');
      if (value.parentSessionId !== null) {
        if (before.state !== 'active') throw new Error('binding_reconnect_required');
        if (!rows(taskId).some(r => identityFor(r).product === product && identityFor(r).parentSessionId === null)) throw new Error('binding_child_requires_root');
        // Receipt identity alone does not establish family membership. Discovery
        // must independently verify the relation, including before its next poll.
        await service.tick(taskId); authorize(taskId, true, before.generation);
        checkIdentity(taskId, value);
        const member = store.get<BindingRow>('SELECT * FROM session_bindings WHERE session_id=?', [value.sessionId]);
        if (!member || member.state !== 'observing' || member.generation !== before.generation) throw new Error('binding_child_requires_root');
        return { status: 'already_connected', role: 'child' as const, ...status(taskId), session_id: value.sessionId,
          automatic_children: provider.capabilities().ancestry === 'verified_relations' };
      }
      const old = store.get<BindingRow>('SELECT * FROM session_bindings WHERE session_id=?', [value.sessionId]);
      if (old?.state === 'observing' && old.generation === before.generation && before.state === 'active') {
        store.execute('UPDATE session_bindings SET connect_receipt=? WHERE session_id=?',[input.receipt,value.sessionId]);
        return { status: 'already_connected', ...status(taskId), session_id: value.sessionId, automatic_children: provider.capabilities().ancestry === 'verified_relations' };
      }
      const restart = before.state !== 'active';
      store.immediateTransaction(() => {
        authorizeConnection(taskId, before.generation);
        if (before.state === 'registered') life.start(taskId); else if (before.state === 'paused') life.resume(taskId);
        const task = life.task(taskId); selectTaskPriceTable(store, taskId, clock());
        bind(taskId, value, value.sessionId, null, task.generation);
        store.execute('UPDATE session_bindings SET connect_receipt=? WHERE session_id=?',[input.receipt,value.sessionId]);
        if (restart) store.execute("UPDATE session_bindings SET generation=?,observed_since=?,state='observing',cursor=NULL WHERE task_id=?", [task.generation, clock(), taskId]);
        const contract = externalContract(store, taskId)!;
        if (contract.started_at === null) {
          const connectedAt = task.started_at!;
          store.execute('UPDATE external_task_contracts SET started_at=?,ends_at=? WHERE task_id=?', [connectedAt, new Date(Date.parse(connectedAt) + contract.followup_seconds * 1000).toISOString(), taskId]);
        }
        store.execute("UPDATE external_preparations SET first_connected_at=COALESCE(first_connected_at,?),state='connected',reason_code=NULL WHERE task_id=?", [clock(), taskId]);
      });
      if (restart) noteBindingQualificationTransition(options.qualificationLease, store, taskId);
      checkBindingQualificationIdentity(options.qualificationLease,store,taskId,value);
      try {
        for (const row of rows(taskId).filter(row => restart || row.session_id === value.sessionId)) await read(taskId, row, true);
      } catch (error) {
        if (store.get('SELECT id FROM tasks WHERE id=?', [taskId])) try{pause(taskId);}catch{ /* Binding fences are durable; preserve the original read failure. */ }
        throw error;
      }
      return { status: old ? 'reconnected' : 'connected', ...status(taskId), session_id: value.sessionId, automatic_children: provider.capabilities().ancestry === 'verified_relations' };
  };
  const service = {
    status, pause, flushForgotten, sourceSupported, resumeAvailable,
    async resume(taskId: string) {
      if (options.qualificationLease && !bindingQualificationOwnerLive(options.qualificationLease)) throw new Error('binding_qualification_live_root_required');
      if (life.state(taskId) !== 'paused') throw new Error('binding_reconnect_required');
      authorizeConnection(taskId);
      const roots = rows(taskId).filter(r => identityFor(r).parentSessionId === null);
      if (!resumeAvailable(taskId)) throw new Error('binding_reconnect_required');
      const root=roots[0]!; const identity = identityFor(root); return await connect(taskId, identity.product, {receipt:root.connect_receipt!}, identity);
    },
    capabilities: (taskId: string, product: BindingProduct) => providerFor(product, taskId).capabilities(),
    connect: (taskId: string, product: BindingProduct, request: CurrentIdentityRequest) => connect(taskId, product, request),
    async tick(taskId: string) {
      await flushForgotten();
      const task = life.task(taskId); if (task.state !== 'active') return status(taskId);
      if(!rows(taskId).some(row=>row.state==='observing'&&row.generation===task.generation))return status(taskId);
      authorize(taskId, true, task.generation);
      const pending = rows(taskId).filter(row => row.state === 'observing' && row.generation === task.generation);
      for (let index = 0; index < pending.length; index++) {
        const row = pending[index]!; const value = identityFor(row); const provider = providerFor(value.product, taskId);
        authorizeObservation(taskId,row);
        const discovered = await provider.discoverChildren(value); authorizeObservation(taskId,row);
        // Candidate providers may report a rejected ancestry/family as a gap
        // instead of returning its identity. A pilot cannot continue past it.
        if(options.humanPilot&&discovered.gaps.length)throw new Error('binding_pilot_family_scope');
        let depth = 0; let ancestor = row;
        while (identityFor(ancestor).parentSessionId !== null) { depth++; ancestor = pending.find(p => p.session_id === identityFor(ancestor).parentSessionId)!; if (!ancestor || depth > 32) throw new Error('binding_relation_invalid'); }
        for (const child of discovered.children) {
          const identity = checkIdentity(taskId, child.identity);
          if (child.parentSessionId !== value.sessionId || identity.parentSessionId !== value.sessionId || identity.sessionId === value.sessionId || !child.relationEvidenceId) throw new Error('binding_relation_invalid');
          if (depth >= provider.capabilities().maxDepth || rows(taskId).filter(r => r.root_id === row.root_id).length >= 32) {
            discovered.gaps.push(depth >= provider.capabilities().maxDepth ? 'binding_depth_limit' : 'binding_family_limit'); continue;
          }
          const existing = pending.find(p => p.session_id === identity.sessionId);
          if (existing) { if (existing.root_id !== row.root_id) throw new Error('binding_relation_invalid'); continue; }
          store.immediateTransaction(() => { authorize(taskId, true, task.generation); bind(taskId, identity, row.root_id, child.relationEvidenceId, task.generation); });
          checkBindingQualificationIdentity(options.qualificationLease,store,taskId,identity);
          const linked = store.get<BindingRow>('SELECT * FROM session_bindings WHERE session_id=?', [identity.sessionId])!;
          linked.observed_since = row.observed_since;
          store.execute('UPDATE session_bindings SET observed_since=? WHERE session_id=?', [linked.observed_since, identity.sessionId]);
          if (Date.parse(identity.createdAt) < Date.parse(row.observed_since)) {
            linked.gaps = JSON.stringify(['late_linked_member']);
            store.execute('UPDATE session_bindings SET gaps=? WHERE session_id=?', [linked.gaps, identity.sessionId]);
            recordObservationGap(store, taskId, identity.sessionId, row.observed_since, clock(), 'incomplete', clock());
            await read(taskId, linked, true);
          }
          // Baseline reads commit a new cursor. Discovery must use that current
          // snapshot rather than treating our own cursor update as revocation.
          pending.push(store.get<BindingRow>('SELECT * FROM session_bindings WHERE session_id=?',[identity.sessionId])!);
        }
        if (discovered.gaps.length) store.execute('UPDATE session_bindings SET gaps=? WHERE session_id=?', [JSON.stringify(cleanGaps([...z.array(z.string()).parse(JSON.parse(row.gaps) as unknown), ...discovered.gaps])), row.session_id]);
      }
      for (const row of rows(taskId).filter(r => r.state === 'observing' && r.generation === task.generation)) await read(taskId, row, false);
      // An awaited read may finish just before pause fences the task. Do not
      // clear that fence when this tick's continuation finally runs.
      store.execute("UPDATE external_preparations SET state='measuring' WHERE task_id=? AND state!='stopped'", [taskId]);
      return status(taskId);
    },
  };
  return service;
}
export type SessionBindingService = ReturnType<typeof createSessionBindingService>;
