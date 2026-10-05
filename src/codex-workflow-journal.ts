import { IdSchema } from './contracts.js';
import { CostFactsSchema } from './flexible-contracts.js';
import type { CostCoverageEvidence } from './flexible-contracts.js';
import type { Store } from './store.js';

export const codexWorkflowProfileId = 'codex-workflow-own-response-v1';
export const codexWorkflowChildProfileId = 'codex-workflow-direct-child-v1';
export interface CodexWorkflowRun {
  id:string; task_id:string; project_id:string; session_id:string|null; source_path:string|null;
  source_identity:string|null;source_size:number|null;source_prefix_hash:string|null;confirmation_id:string|null;purpose:'development'|'qualification';generation:number;
  operation:'launch'|'resume'|'link'|'collect'; state:'running'|'completed'|'failed'|'stopped'; stop_requested:number;
  instruction_manifest_hash:string; application:'pending'|'invocation_settings_verified'|'external_unverified';
  started_at:string; ended_at:string|null; reason:string|null; scope_verified:number; identity_verified:number; observed_requests:number;
  diagnostic_stage:string|null;diagnostic_code:string|null;
}
export function codexWorkflowRun(store:Store,id:string):CodexWorkflowRun|undefined {
  IdSchema.parse(id);return store.get<CodexWorkflowRun>('SELECT * FROM codex_workflow_runs WHERE id=?',[id]);
}
/** Durable control only: never finalizes a human task or starts a native process. */
export function stopCodexWorkflow(store:Store,id:string) {
  return store.immediateTransaction(()=>{
    const row=codexWorkflowRun(store,id);if(!row)throw new Error('unknown_codex_workflow_run');
    if(row.state==='running')store.execute('UPDATE codex_workflow_runs SET stop_requested=1 WHERE id=?',[id]);
    return {run_id:id,task_id:row.task_id,stop_requested:row.state==='running',state:row.state};
  });
}
/** Only host scope/identity facts supported by successful guarded reads are
 * verified. Native request universe, flush/terminal coverage and completeness
 * remain unknown, even if a product process exited successfully. */
export function codexWorkflowCostFacts(store:Store,taskId:string,window?:{start:string;end:string}):Pick<CostCoverageEvidence,'facts'|'has_observed_value'> {
  const facts=CostFactsSchema.parse(Object.fromEntries(Object.keys(CostFactsSchema.shape).map(k=>[k,'unknown'])));
  const runs=store.all<CodexWorkflowRun>('SELECT * FROM codex_workflow_runs WHERE task_id=?',[taskId]).filter(r=>!window||Date.parse(r.started_at)<Date.parse(window.end)&&r.ended_at!==null&&Date.parse(r.ended_at)<=Date.parse(window.end)&&Date.parse(r.ended_at)>=Date.parse(window.start));
  const covered=new Set(runs.flatMap(r=>[r.session_id,...store.all<{session_id:string}>('SELECT session_id FROM codex_workflow_children WHERE run_id=? AND source_identity IS NOT NULL',[r.id]).map(c=>c.session_id)]));
  const uncovered=store.all<{id:string}>('SELECT id FROM sessions WHERE task_id=?',[taskId]).some(s=>!covered.has(s.id));
  if(!uncovered&&runs.length&&runs.every(r=>r.purpose==='development'&&r.scope_verified===1&&r.reason!=='scope_revoked'))facts.scope_before_access='verified';
  if(!uncovered&&runs.length&&runs.every(r=>r.purpose==='development'&&r.identity_verified===1&&r.state==='completed'))facts.immutable_identity='verified';
  if(runs.some(r=>r.reason==='source_changed'||r.diagnostic_code==='source_changed'))facts.immutable_identity='violated';
  return {facts,has_observed_value:!!store.get("SELECT 1 FROM events WHERE task_id=? AND json_extract(payload,'$.kind')='usage' LIMIT 1",[taskId])};
}
