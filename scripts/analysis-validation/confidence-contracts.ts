import { z } from 'zod';
import { rational,equal,decodeRational } from './contracts.js';
import { parseDesign,observedIds } from './design.js';
import type { Label,Rational,StudyDesign } from './contracts.js';
export type Endpoint='usage'|'deadline_success';
export interface EndpointSchedule { potentialA:number[];potentialB:number[] }
export interface EndpointObservation { taskIds:string[];labels:Label[];values:number[] }
export interface EndpointDomain { endpoint:Endpoint;lattice:readonly number[] }
export const domains:readonly EndpointDomain[]=[{endpoint:'usage',lattice:[0,1,2]},{endpoint:'deadline_success',lattice:[0,1]}];
export const observationSchema=z.strictObject({taskIds:z.array(z.string()).min(1).max(4),labels:z.array(z.enum(['A','B'])).min(1).max(4),values:z.array(z.number().int().nonnegative()).min(1).max(4)});
export const scheduleSchema=z.strictObject({potentialA:z.array(z.number().int().min(0).max(2)).min(1).max(4),potentialB:z.array(z.number().int().min(0).max(2)).min(1).max(4)});
export function parseDomain(input:unknown):EndpointDomain {
  const parsed=z.strictObject({endpoint:z.enum(['usage','deadline_success']),lattice:z.array(z.number())}).safeParse(input);
  if(!parsed.success||JSON.stringify(parsed.data.lattice)!==JSON.stringify(parsed.data.endpoint==='usage'?[0,1,2]:[0,1]))throw new Error('invalid_domain');
  return parsed.data;
}
export function assertBudget(n:number,l:number,s:number):void {
  if(!Number.isInteger(n)||n<1||n>4||![2,3].includes(l)||!Number.isInteger(s)||s<1||s>16||l**(2*n)>6561||l**n>81||l**(2*n)*s*s>2_000_000||l**(2*n)*s>200_000)throw new Error('confidence_resource_limit');
}
// Count distinct prefix paths combinatorially before enumerating them.
export function confidenceDesign(input:unknown,domain:EndpointDomain):StudyDesign {
  const design=parseDesign(input),n=observedIds(design).length;
  if(!n)throw new Error('empty_population');
  if(design.strata.some(s=>s.blocks.every(b=>!b.observationMask.some(Boolean))))throw new Error('empty_stratum');
  const choose=(a:number,b:number):number=>b<0||b>a?0:b===0?1:choose(a-1,b-1)+choose(a-1,b);
  let supportCount=1;
  for(const s of design.strata)for(const b of s.blocks){
    const r=b.observationMask.filter(Boolean).length;
    let count=0;for(let k=0;k<=r;k++)if(k<=design.blockSize/2&&r-k<=design.blockSize/2)count+=choose(r,k);
    supportCount*=count;
  }
  assertBudget(n,domain.lattice.length,supportCount);return design;
}
export function validateFraction(value:Rational,probability=false):void {
  if(typeof value.numerator!=='bigint'||typeof value.denominator!=='bigint'||value.denominator<=0n)throw new Error('invalid_rational');
  const reduced=rational(value.numerator,value.denominator);
  if(reduced.numerator!==value.numerator||reduced.denominator!==value.denominator||(probability&&(value.numerator<=0n||value.numerator>=value.denominator)))throw new Error('invalid_rational');
}
export interface ConfidenceSet {
  values:Rational[];compatibleValues:Rational[];lower:Rational|null;upper:Rational|null;reason:null|'empty_confidence_set';
  diagnostics:{compatibleTargetCount:number;acceptedTargetCount:number;removedCompatibleTargetCount:number;compatibilityHullWidth:Rational;confidenceHullWidth:Rational|null;noInferentialNarrowing:boolean};
}
export interface Envelope {target:Rational;value:Rational;compatibleCount:number;status:'evaluated'|'infeasible_target'}
export function setFromEnvelopes(rows:readonly Envelope[],alpha:Rational):ConfidenceSet {
  validateFraction(alpha,true);
  const compatibleValues=rows.filter(x=>x.compatibleCount>0).map(x=>x.target);
  const values=rows.filter(x=>x.value.numerator*alpha.denominator>alpha.numerator*x.value.denominator).map(x=>x.target);
  const width=(v:Rational[]):Rational|null=>{const a=v[0],b=v.at(-1);return a&&b?rational(b.numerator*a.denominator-a.numerator*b.denominator,b.denominator*a.denominator):null;};
  return {values,compatibleValues,lower:values[0]??null,upper:values.at(-1)??null,reason:values.length?null:'empty_confidence_set',diagnostics:{compatibleTargetCount:compatibleValues.length,acceptedTargetCount:values.length,removedCompatibleTargetCount:compatibleValues.length-values.length,compatibilityHullWidth:width(compatibleValues)??rational(0n),confidenceHullWidth:width(values),noInferentialNarrowing:values.length===compatibleValues.length&&values.every((x,i)=>equal(x,compatibleValues[i]!))}};
}

const countJson=z.number().int().nonnegative().safe();
const hashJson=z.string().regex(/^[a-f0-9]{64}$/);
const fractionJson=z.strictObject({numerator:z.string(),denominator:z.string()}).refine(x=>{try{decodeRational(x);return true;}catch{return false;}});
const probabilityJson=fractionJson.refine(x=>{try{decodeRational(x,true);return true;}catch{return false;}});
const auditJson=z.strictObject({expected_count:countJson,executed_count:countJson,expected_sha256:hashJson,executed_sha256:hashJson,matches:z.boolean()});
const rangeJson=z.strictObject({minimum:fractionJson,maximum:fractionJson,minimum_witness:z.string(),maximum_witness:z.string()});
const endpointCounts=z.strictObject({truth_tables:countJson,observations:countJson,envelopes:countJson,sets:countJson,coverage_checks:countJson,coverage_paths:countJson,reference_rows:countJson});
export const EndpointEvidenceSchema=z.strictObject({
  design_id:z.string(),endpoint:z.enum(['usage','deadline_success']),failures:z.array(z.string()),counts:endpointCounts,expected_counts:endpointCounts,
  registries:z.strictObject({observations_targets_alphas:auditJson,truth_alphas:auditJson}),
  summaries:z.array(z.strictObject({alpha:probabilityJson,coverage:rangeJson,miss_probability:rangeJson,empty_probability:rangeJson,no_inferential_narrowing_probability:rangeJson,expected_compatible_count:rangeJson,expected_accepted_count:rangeJson,expected_removed_count:rangeJson,expected_compatibility_width:rangeJson,expected_confidence_width_nonempty:rangeJson.optional()})),
  envelope_set_sha256:hashJson,coverage_sha256:hashJson,
});
const globalCounts=z.strictObject({truth_tables:countJson,observations:countJson,envelopes:countJson,sets:countJson,coverage_checks:countJson,coupled_cases:countJson,coupled_checks:countJson});
export const ConfidenceEvidenceSchema=z.strictObject({
  schema_version:z.literal(1),status:z.enum(['pass','fail']),method:z.literal('bounded-weak-null-envelope-1'),
  settings:z.strictObject({method_version:z.literal('bounded-weak-null-envelope-1'),design_version:z.literal('balanced-prefix-1'),case_version:z.literal('bounded-full-tables-1'),domain_version:z.literal('usage012-deadline01-1'),alphas:z.array(z.string()),family_alphas:z.array(z.string()),max_tasks:countJson,max_support:countJson,max_truth_tables:countJson,max_completions:countJson,max_reference_rows:countJson,max_coverage_lookups:countJson,r10_status:z.literal('unvalidated'),adoption:z.literal('inconclusive')}),
  provenance:z.strictObject({files:z.array(z.strictObject({path:z.string(),sha256:hashJson})),source_sha256:hashJson,settings_sha256:hashJson,design_sha256:hashJson,grid_sha256:hashJson}),
  runtime:z.strictObject({node:z.string(),npm:z.string(),lockfile_version:countJson,typescript:z.string(),zod:z.string()}),
  expected_counts:globalCounts,counts:globalCounts,failures:z.array(z.string()),endpoints:z.array(EndpointEvidenceSchema),
  coupled:z.array(z.strictObject({case_id:z.string(),family_alpha:probabilityJson,joint_coverage:probabilityJson,marginal_usage_coverage:probabilityJson,marginal_quality_coverage:probabilityJson,task_annotations:z.array(z.strictObject({assignee_id:z.string(),time_index:countJson}))})),
  registries:z.strictObject({endpoints:auditJson,coupled:auditJson}),r10_status:z.literal('unvalidated'),adoption:z.literal('inconclusive'),
  supported_domain:z.literal('fixed_complete_synthetic_usage012_deadline01_N1to4_nine_designs'),unsupported_domains:z.array(z.string()),
});
