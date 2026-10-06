import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { evaluateReadiness, productionSourceEvidence, type ReadinessInput } from '../src/readiness.js';
import { evaluateCostCoverage } from '../src/cost-coverage.js';
import { claudeWorkflowProfileId, createClaudeWorkflowAdapter } from '../src/claude-workflow-adapter.js';
import { registerVariant, registerProtocol, freezeProtocol } from '../src/comparison.js';
import { registerPriceTable } from '../src/pricing.js';
import { Lifecycle } from '../src/lifecycle.js';
import { Store } from '../src/store.js';
import { runAssignedWorkflow, workflowStatus } from '../src/task-workflow.js';
import { makeFlexibleFixture } from './helpers/flexible-fixture.js';
import { assignmentInput } from './helpers/comparison-fixture.js';

const evidenceId = 'claude-workflow-02188-root-native-v1';
const profile = { product: 'claude_code' as const, product_version: '2.1.288', profile_id: claudeWorkflowProfileId };
function readiness(): ReadinessInput {
  const f = makeFlexibleFixture();
  return { protocol: { ...f.protocol, purpose: 'real_experiment', source_profiles: [profile] }, source_evidence_ids: [evidenceId],
    coverage: [{ evidence: f.coverage, decision: evaluateCostCoverage(f.coverage) }], analysis_evidence_id: null, invalidated: false, followup_complete: true };
}
test('the parent-only Claude 2.1.288 registration admits allocation but never complete cost or inference', () => {
  expect(productionSourceEvidence.filter(row => row.product === 'claude_code')).toEqual([{ id: evidenceId, ...profile, validation_kind: 'real_operations', complete_cost: false,
    semantics_digest: '4cc9688995d6f2a95b9220db9b694ecff0d33a52e9f8672426212bee9daa57ad' }]);
  expect(Object.isFrozen(productionSourceEvidence.find(row => row.id === evidenceId))).toBe(true);
  expect(evaluateReadiness(readiness())).toMatchObject({ real_allocation: true, complete_cost: false, inference: false });
});
test.each([{ ...profile, product_version: '2.1.289' }, { ...profile, product_version: '2.1.290' }, { ...profile, profile_id: 'claude-child-own-v1' }])(
  'unmatched Claude source $product_version/$profile_id remains closed', mismatch => {
    expect(evaluateReadiness({ ...readiness(), protocol: { ...readiness().protocol, source_profiles: [mismatch] } })).toMatchObject({ real_allocation: false });
  });

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'claude-admission-'))); const project = join(root, 'project'); mkdirSync(project);
  const store = new Store(join(root, 'measurement.sqlite')); const f = makeFlexibleFixture(); const now = Date.now();
  f.protocol.purpose = 'functional_pilot'; delete f.protocol.minimum_effect; delete f.protocol.quality_margin; delete f.protocol.confidence_level;
  f.protocol.source_profiles = [profile]; f.metadata.product = 'claude_code';
  f.protocol.recruitment_start = new Date(now - 60000).toISOString(); f.protocol.recruitment_end = new Date(now + 3600000).toISOString();
  new Lifecycle(store).registerProject('project-1', project);
  const artifacts = f.variants.map((variant, index) => {
    const path = join(root, `${variant.id}.md`); const content = `SYNTHETIC_PRIVATE_HARNESS_${index}`; writeFileSync(path, content);
    variant.instruction_manifest_hash = createHash('sha256').update(JSON.stringify([{ artifact_id: 'instruction', sha256: createHash('sha256').update(content).digest('hex') }])).digest('hex');
    registerVariant(store, variant); return { variant_id: variant.id, selected_artifacts: [{ artifact_id: 'instruction', path }] };
  });
  registerPriceTable(store, f.priceTable); registerProtocol(store, f.protocol); freezeProtocol(store, f.protocol.id, new Date(now - 120000).toISOString());
  const input = { schema_version: 1, assignment: { ...assignmentInput, schema_version: 2, metadata: f.metadata }, product_version: '2.1.288', confirmation_id: 'confirmation-1', artifacts };
  const prompt = join(root, 'prompt.txt'); writeFileSync(prompt, 'SYNTHETIC_PRIVATE_TASK');
  // A stand-in executable: the registered SHA is checked before anything can launch.
  const binary = { path: realpathSync(process.execPath), version: '2.1.288', sha256: createHash('sha256').update(readFileSync(process.execPath)).digest('hex') };
  const execution = { operation: 'launch', run_id: 'claude-run', binary, workspace: join(root, 'workspace'), mediator_path: resolve('dist/claude-probe-hook-mediator.js'),
    prompt_file: prompt, permissions: 'workspace-edit', timeout_ms: 3600000, max_turns: 200, request_limit: 400 };
  return { store, input, execution, project, protocolId: f.protocol.id, cleanup: () => { store.close(); rmSync(root, { recursive: true, force: true }); } };
}
test('an admitted Claude protocol reports native execution and still checks child scope and binary before assignment', async () => {
  const f = fixture(); try {
    expect(workflowStatus(f.store, f.protocolId)).toMatchObject({ native_execution: true, blockers: ['whole_task_cost_unconfirmed', 'analysis_unverified'] });
    await expect(runAssignedWorkflow(f.store, f.input, createClaudeWorkflowAdapter(f.store, { ...f.execution, child_runtime: { model: 'child-model', effort: 'low' } }), { model: null, effort: null }))
      .rejects.toThrow(/^claude_workflow_child_unadmitted$/);
    await expect(runAssignedWorkflow(f.store, f.input, createClaudeWorkflowAdapter(f.store, { ...f.execution, binary: { ...f.execution.binary, sha256: 'f'.repeat(64) } }), { model: null, effort: null }))
      .rejects.toThrow(/^claude_probe_executable_mismatch$/);
    expect(f.store.all('SELECT * FROM comparison_assignments')).toHaveLength(0);
    expect(f.store.all('SELECT * FROM claude_workflow_runs')).toHaveLength(0);
  } finally { f.cleanup(); }
});
test('workspace-edit refuses harness files the model could edit inside the project root', async () => {
  const f = fixture(); try {
    const prompt = join(f.project, 'prompt.txt'); writeFileSync(prompt, 'SYNTHETIC_PRIVATE_TASK');
    const insideBinary = join(f.project, 'claude'); writeFileSync(insideBinary, 'synthetic');
    // A symlinked mediator outside the root whose target is inside it.
    const target = join(f.project, 'mediator.js'); writeFileSync(target, ''); const outside = join(dirname(f.project), 'linked'); mkdirSync(outside);
    symlinkSync(target, join(outside, 'mediator.js'));
    const cases: Record<string, unknown>[] = [{ workspace: join(f.project, 'workspace') }, { mediator_path: join(f.project, 'dist', 'claude-probe-hook-mediator.js') }, { prompt_file: prompt },
      { binary: { ...f.execution.binary, path: insideBinary } }, { mediator_path: join(outside, 'mediator.js') }];
    // A case-insensitive volume reaches the same directory through another spelling.
    const alias = join(dirname(f.project), basename(f.project).toUpperCase());
    if (existsSync(alias)) cases.push({ mediator_path: join(alias, 'dist', 'claude-probe-hook-mediator.js') });
    for (const inside of cases)
      await expect(runAssignedWorkflow(f.store, f.input, createClaudeWorkflowAdapter(f.store, { ...f.execution, ...inside }), { model: null, effort: null }))
        .rejects.toThrow(/^claude_workflow_harness_inside_project$/);
    // Read-only runs cannot modify files, so the same layout reaches the next preflight check.
    await expect(runAssignedWorkflow(f.store, f.input, createClaudeWorkflowAdapter(f.store, { ...f.execution, permissions: 'read-only', workspace: join(f.project, 'workspace'),
      binary: { ...f.execution.binary, sha256: 'f'.repeat(64) } }), { model: null, effort: null })).rejects.toThrow(/^claude_probe_executable_mismatch$/);
    expect(f.store.all('SELECT * FROM comparison_assignments')).toHaveLength(0);
  } finally { f.cleanup(); }
});
