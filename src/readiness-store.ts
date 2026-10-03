import type { Store } from './store.js';
import { protocolRow } from './comparison.js';
import { parseProtocol,CostFactsSchema,type CostCoverageEvidence } from './flexible-contracts.js';
import { evaluateCostCoverage } from './cost-coverage.js';
import { evaluateReadiness,productionSourceEvidence,syntheticSourceEvidence } from './readiness.js';
export function comparisonReadiness(store:Store,protocolId:string,at=new Date().toISOString()){
  const row=protocolRow(store,protocolId);const protocol=parseProtocol(JSON.parse(row.settings) as unknown);
  if(protocol.schema_version!==2)throw new Error('unsupported_readiness_mode');
  const tasks=store.all<{task_id:string;assigned_at:string;followup_ends_at:string;started_at:string|null}>('SELECT a.task_id,a.assigned_at,a.followup_ends_at,t.started_at FROM comparison_assignments a JOIN tasks t ON t.id=a.task_id WHERE a.protocol_id=? ORDER BY a.task_id',[protocolId]);
  const registry=protocol.purpose==='synthetic_validation'?syntheticSourceEvidence:productionSourceEvidence;
  const ids=registry.filter(e=>protocol.source_profiles.some(p=>p.product===e.product&&p.product_version===e.product_version&&p.profile_id===e.profile_id)).map(e=>e.id);
  const coverage=tasks.map(t=>{
    const evidence:CostCoverageEvidence={profile_id:'unsupported-production-cost',task_id:t.task_id,window_start:t.assigned_at,window_end:t.followup_ends_at,
      facts:CostFactsSchema.parse(Object.fromEntries(Object.keys(CostFactsSchema.shape).map(k=>[k,'unknown']))),has_observed_value:false};
    return {evidence,decision:evaluateCostCoverage(evidence)};
  });
  return evaluateReadiness({protocol,source_evidence_ids:ids,coverage,analysis_evidence_id:null,invalidated:row.status!=='frozen',followup_complete:tasks.length>0&&tasks.every(t=>Date.parse(t.followup_ends_at)<=Date.parse(at))});
}
