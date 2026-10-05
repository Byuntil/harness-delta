import { z } from 'zod';
import { assignTask } from './allocation.js';
import type { AssignmentRow } from './allocation.js';
import { IdSchema, ModelSchema, ProductVersionSchema } from './contracts.js';
import { ConfigurationRecordSchema, parseComparison } from './comparison-contracts.js';
import { FlexibleAssignmentInputSchema } from './flexible-contracts.js';
import { comparisonProtocol, comparisonVariant, protocolRow } from './comparison.js';
import { confirmConfiguration, requireConfigurationConfirmation, selectedArtifactSnapshot } from './config-confirmation.js';
import { Lifecycle, utcNow } from './lifecycle.js';
import type { Clock, Outcome } from './lifecycle.js';
import { comparisonReadiness } from './readiness-store.js';
import { productionSourceEvidence, syntheticSourceEvidence } from './readiness.js';
import type { Store } from './store.js';
import { codexWorkflowProfileId, codexWorkflowChildProfileId } from './codex-workflow-journal.js';

const artifactSchema = z.strictObject({ artifact_id: IdSchema, path: z.string().min(1).max(4096) });
export const AssignedWorkflowInputSchema = z.strictObject({ schema_version: z.literal(1),
  assignment: FlexibleAssignmentInputSchema, product_version: ProductVersionSchema, confirmation_id: IdSchema,
  artifacts: z.array(z.strictObject({ variant_id: IdSchema, selected_artifacts: z.array(artifactSchema).min(1).max(256) })).length(2)
    .refine(rows => new Set(rows.map(row => row.variant_id)).size === rows.length) });
export const WorkflowRuntimeSchema = z.strictObject({ model: ModelSchema.nullable(), effort: IdSchema.nullable() });
export type WorkflowRuntime = z.infer<typeof WorkflowRuntimeSchema>;
export interface WorkflowExecutionContext {
  projectId: string; projectRoot: string; taskId: string; generation: number;
  assignedVariantId: string; confirmationId: string;
  instructionManifestHash: string;
  runtime: WorkflowRuntime; instructions: { artifact_id: string; content: string }[];
  /** Recheck before every source read, launch and observation boundary. */
  assertActive(): void;
}
/** Trusted code adapter, not a user-configured script or admission flag.
 * Owns per-invocation application, pre-access linkage, collection and teardown.
 * Native execution remains gated by the code-owned qualification registry.
 */
export interface WorkflowAdapter {
  product: 'synthetic' | 'codex' | 'claude_code'; productVersion: string; profileId: string;
  run(context: WorkflowExecutionContext): Promise<void | WorkflowAdapterResult>;
}
export interface WorkflowAdapterResult {
  diagnostic?:import('./codex-workflow-adapter.js').CodexWorkflowDiagnostic|null;
  run_id:string;session_id:string|null;state:'completed'|'failed'|'stopped';reason:string|null;
  observed_requests:number;harness_application:'invocation_settings_verified'|'external_unverified'|'unapplied';
}

function workflowProtocol(store: Store, protocolId: string) {
  const protocol = comparisonProtocol(store, protocolRow(store, protocolId));
  if (protocol.schema_version !== 2) throw new Error('unsupported_workflow_mode');
  return protocol;
}
function checkReadiness(store: Store, protocolId: string, at: string) {
  const protocol = workflowProtocol(store, protocolId);
  if (protocol.purpose !== 'synthetic_validation' && !comparisonReadiness(store, protocolId, at).real_allocation) throw new Error('real_experiment_disabled');
  return protocol;
}

/** Persist original assignment before revealing/reading selected instruction bytes.
 * Returns private transient application data separately from the printable receipt.
 */
export function beginAssignedWorkflow(store: Store, input: unknown, runtimeInput: unknown, clock: Clock = utcNow) {
  const config = parseComparison(AssignedWorkflowInputSchema, input, 'invalid_workflow_input');
  const runtime = parseComparison(WorkflowRuntimeSchema, runtimeInput, 'invalid_workflow_runtime');
  const now = clock(); const requested = checkReadiness(store, config.assignment.protocol_id, now);
  if (config.artifacts.some(row => !requested.variant_ids.includes(row.variant_id)) ||
      !requested.source_profiles.some(row => row.product === config.assignment.metadata.product && row.product_version === config.product_version)) throw new Error('workflow_configuration_mismatch');
  const assignment = assignTask(store, config.assignment, { clock: () => now });
  const protocol = checkReadiness(store, assignment.protocol_id, now);
  if (protocol.id !== requested.id) throw new Error('workflow_protocol_mismatch');
  const life = new Lifecycle(store, () => now); const task = life.task(assignment.task_id);
  if (task.state === 'finalized') throw new Error('invalid_transition');
  if(store.get("SELECT 1 FROM codex_workflow_runs WHERE task_id=? AND state='running' UNION ALL SELECT 1 FROM claude_workflow_runs WHERE task_id=? AND state='running'",[assignment.task_id,assignment.task_id]))throw new Error('workflow_run_active');
  const selected = config.artifacts.find(row => row.variant_id === assignment.assigned_variant_id);
  if (!selected) throw new Error('workflow_configuration_mismatch');
  const artifacts = selected.selected_artifacts.map(row => ({ artifactId: row.artifact_id, path: row.path }));
  const snapshot = selectedArtifactSnapshot(artifacts);
  const variant = comparisonVariant(store, assignment.assigned_variant_id);
  if (snapshot.hash !== variant.instruction_manifest_hash) throw new Error('workflow_manifest_mismatch');
  store.immediateTransaction(() => {
    confirmConfiguration(store, { schema_version: 1, id: config.confirmation_id, task_id: assignment.task_id,
      evidence_method: 'selected_artifact_hash', actual_variant_id: assignment.assigned_variant_id,
      product: config.assignment.metadata.product, product_version: config.product_version,
      model: runtime.model, reasoning_setting: runtime.effort, environment_id: config.assignment.environment_id }, now, artifacts);
    const confirmation = store.get<{ payload: string }>('SELECT payload FROM comparison_confirmations WHERE id=?', [config.confirmation_id]);
    const record = parseComparison(ConfigurationRecordSchema, JSON.parse(confirmation?.payload ?? 'null') as unknown, 'workflow_manifest_mismatch');
    if (record.verification_status !== 'confirmed' || record.observed_config_hash !== snapshot.hash) throw new Error('workflow_manifest_mismatch');
    const state = life.state(assignment.task_id);
    if (state === 'registered') life.start(assignment.task_id);
    else if (state === 'paused') life.resume(assignment.task_id);
    else if (state !== 'active') throw new Error('invalid_transition');
    requireConfigurationConfirmation(store, assignment.task_id, now);
  });
  const current = life.task(assignment.task_id);
  return { receipt: { ...assignment, confirmation_id: config.confirmation_id, generation: current.generation,
    state: current.state, instruction_manifest_hash: snapshot.hash, harness_application: 'prepared_only' as const,
    complete_cost: null, inference: false }, instructions: snapshot.instructions };
}

/** No native calls occur unless a matching code-owned real source qualifies.
 * Adapter return is not human success or proof of complete usage collection.
 */
export async function runAssignedWorkflow(store: Store, input: unknown, adapter: WorkflowAdapter,
  runtimeInput: unknown, clock: Clock = utcNow) {
  const config = parseComparison(AssignedWorkflowInputSchema, input, 'invalid_workflow_input');
  const runtime = parseComparison(WorkflowRuntimeSchema, runtimeInput, 'invalid_workflow_runtime');
  const protocol = checkReadiness(store, config.assignment.protocol_id, clock());
  const registry = protocol.purpose !== 'synthetic_validation' ? productionSourceEvidence : syntheticSourceEvidence;
  const adapterProfileId=adapter.profileId;
  if (adapter.product !== config.assignment.metadata.product || adapter.productVersion !== config.product_version ||
      !registry.some(row => row.product === adapter.product && row.product_version === adapter.productVersion && row.profile_id === adapterProfileId) ||
      !protocol.source_profiles.some(row => row.product === adapter.product && row.product_version === adapter.productVersion && row.profile_id === adapterProfileId) ||
      (protocol.purpose === 'synthetic_validation' && adapter.product !== 'synthetic')) throw new Error('workflow_adapter_mismatch');
  const prepared = beginAssignedWorkflow(store, config, runtime, clock);
  const taskId = prepared.receipt.task_id; const generation = prepared.receipt.generation;
  const projectId = config.assignment.project_id;
  const projectRoot = store.get<{ local_root: string | null }>('SELECT local_root FROM projects WHERE id=?', [projectId])?.local_root;
  if (!projectRoot) throw new Error('workflow_scope_revoked');
  const assertActive = () => {
    if(adapter.profileId!==adapterProfileId)throw new Error('workflow_scope_revoked');
    checkReadiness(store, prepared.receipt.protocol_id, clock());
    const task = store.get<{ state: string; generation: number; project_id: string }>('SELECT state,generation,project_id FROM tasks WHERE id=?', [taskId]);
    const project = store.get<{ local_root: string | null }>('SELECT local_root FROM projects WHERE id=?', [projectId]);
    if (task?.state !== 'active' || task.generation !== generation || task.project_id !== projectId || project?.local_root !== projectRoot ||
        store.get("SELECT 1 FROM tombstones WHERE (kind='task' AND id=?) OR (kind='project' AND id=?)", [taskId, projectId])) throw new Error('workflow_scope_revoked');
    requireConfigurationConfirmation(store, taskId, clock());
    const latest=store.get<{id:string;payload:string}>('SELECT id,payload FROM comparison_confirmations WHERE task_id=? ORDER BY rowid DESC LIMIT 1',[taskId]);
    const confirmation=latest&&ConfigurationRecordSchema.parse(JSON.parse(latest.payload));
    if(latest?.id!==config.confirmation_id||confirmation?.verification_status!=='confirmed'||confirmation.observed_config_hash!==prepared.receipt.instruction_manifest_hash)throw new Error('workflow_scope_revoked');
  };
  assertActive();
  let adapterResult: void | WorkflowAdapterResult;
  try { adapterResult = await adapter.run({ taskId, projectId, projectRoot, generation, assignedVariantId: prepared.receipt.assigned_variant_id,
    confirmationId: config.confirmation_id, instructionManifestHash:prepared.receipt.instruction_manifest_hash, runtime, instructions: prepared.instructions, assertActive }); }
  catch { throw new Error('workflow_adapter_failed'); }
  assertActive();
  return { ...prepared.receipt, execution: 'adapter_returned' as const, outcome: null,
    ...(adapterResult ? {adapter_result:adapterResult} : {}),
    limitations: ['adapter_return_does_not_prove_native_collection', 'human_finalization_required', 'whole_task_cost_unconfirmed'] };
}

export function finishAssignedWorkflow(store: Store, taskId: string, outcome: Outcome, criteria: string[], clock: Clock = utcNow) {
  parseComparison(IdSchema, taskId);
  return store.immediateTransaction(() => {
    const assignment = store.get<AssignmentRow>('SELECT * FROM comparison_assignments WHERE task_id=?', [taskId]);
    if (!assignment) throw new Error('task_not_assigned');
    new Lifecycle(store, clock).finalize(taskId, outcome, criteria);
    return { task_id: taskId, assigned_variant_id: assignment.variant_id, protocol_id: assignment.protocol_id,
      outcome, comparison_snapshot: 'explicit_later_cutoff_required' as const };
  });
}

export function workflowStatus(store: Store, protocolId: string, at = utcNow()) {
  const protocol = workflowProtocol(store, protocolId); const readiness = comparisonReadiness(store, protocolId, at);
  const implemented=protocol.source_profiles.some(p=>p.product==='codex'&&p.product_version==='0.160.0'&&[codexWorkflowProfileId,codexWorkflowChildProfileId].includes(p.profile_id));
  return { schema_version: 1, protocol_id: protocol.id, purpose: protocol.purpose, readiness,
    native_execution: implemented&&readiness.real_allocation, codex_adapter_implemented:true, claude_adapter_implemented:true, common_coordinator: true, selected_instructions: 'transient_per_invocation_boundary',
    blockers: [...(protocol.purpose !== 'synthetic_validation' && !readiness.real_allocation ? ['native_source_unqualified'] : []),
      ...(!implemented?['native_adapter_not_wired']:[]), ...(!readiness.complete_cost ? ['whole_task_cost_unconfirmed'] : []), ...(!readiness.inference ? ['analysis_unverified'] : [])] };
}
