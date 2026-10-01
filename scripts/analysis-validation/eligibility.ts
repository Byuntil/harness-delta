import { StudyCaseSchema } from './contracts.js';
import { enumerateDesign, observedIds } from './design.js';
export const rejectionCodes=['invalid_case','invalid_design','duplicate_id','non_prefix','invalid_block_order','resource_limit','operation_limit','empty_population','empty_stratum','population_alignment','incomplete_usage','incomplete_quality','unsupported_grouping','unsupported_enrollment','unsupported_history','unsupported_truncation'] as const;
export type RejectionCode=typeof rejectionCodes[number];
export function assessStudyCase(input:unknown):{status:'eligible'}|{status:'rejected';reasonCodes:RejectionCode[]} {
  const parsed=StudyCaseSchema.safeParse(input);
  if(!parsed.success)return {status:'rejected',reasonCodes:['invalid_case']};
  const c=parsed.data;
  try{enumerateDesign(c.design);}catch(error){
    const code=error instanceof Error?error.message:'';
    return {status:'rejected',reasonCodes:[rejectionCodes.find(x=>x===code)??'invalid_design']};
  }
  const reasonCodes:RejectionCode[]=[];
  if(!c.population.length)reasonCodes.push('empty_population');
  else if(c.design.strata.some(s=>s.blocks.every(b=>!b.observationMask.some(Boolean))))reasonCodes.push('empty_stratum');
  if(JSON.stringify(observedIds(c.design))!==JSON.stringify(c.population.map(x=>x.taskId)))reasonCodes.push('population_alignment');
  if(c.population.some(x=>x.usageCoverage!=='complete'))reasonCodes.push('incomplete_usage');
  if(c.population.some(x=>x.qualityState!=='complete'))reasonCodes.push('incomplete_quality');
  if(c.grouping!=='original_assignment')reasonCodes.push('unsupported_grouping');
  if(c.enrollment!=='fixed')reasonCodes.push('unsupported_enrollment');
  if(c.history!=='no_interference')reasonCodes.push('unsupported_history');
  if(c.truncation!=='independent_fixed')reasonCodes.push('unsupported_truncation');
  return reasonCodes.length?{status:'rejected',reasonCodes}:{status:'eligible'};
}
