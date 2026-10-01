import { z } from 'zod';
export type Label = 'A' | 'B';
export interface Rational { numerator: bigint; denominator: bigint }
export interface AssignmentMass { labels: Label[]; weight: Rational }
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const DesignSchema = z.strictObject({
  blockSize: z.union([z.literal(2),z.literal(4),z.literal(6),z.literal(8)]),
  strata: z.array(z.strictObject({ stratumId:id, blocks:z.array(z.strictObject({
    blockId:id, scheduledTaskIds:z.array(id).max(8), observationMask:z.array(z.boolean()).max(8),
  })).min(1).max(4) })).min(1).max(2),
});
export type StudyDesign = z.infer<typeof DesignSchema>;
export function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator <= 0n) throw new Error('invalid_rational');
  let a=numerator<0n?-numerator:numerator, b=denominator;
  while(b) { const next=a%b; a=b; b=next; }
  return {numerator:numerator/a,denominator:denominator/a};
}
export const add = (a:Rational,b:Rational) => rational(a.numerator*b.denominator+b.numerator*a.denominator,a.denominator*b.denominator);
export const multiply = (a:Rational,b:Rational) => rational(a.numerator*b.numerator,a.denominator*b.denominator);
export const equal = (a:Rational,b:Rational) => a.numerator*b.denominator===b.numerator*a.denominator;
export const lessEqual = (a:Rational,b:Rational) => a.numerator*b.denominator<=b.numerator*a.denominator;
export const encodeRational = (r:Rational) => ({numerator:r.numerator.toString(),denominator:r.denominator.toString()});
export function decodeRational(input:unknown, probability=false):Rational {
  const parsed=z.strictObject({ numerator:z.string().regex(/^(0|-?[1-9][0-9]*)$/), denominator:z.string().regex(/^[1-9][0-9]*$/) }).safeParse(input);
  if(!parsed.success) throw new Error('invalid_rational');
  const r=rational(BigInt(parsed.data.numerator),BigInt(parsed.data.denominator));
  if (r.numerator.toString()!==parsed.data.numerator || r.denominator.toString()!==parsed.data.denominator || (probability && (r.numerator<0n || r.numerator>r.denominator))) throw new Error('invalid_rational');
  return r;
}
export function validateSupport(support:readonly AssignmentMass[], n:number):void {
  const seen=new Set<string>(); let total=rational(0n);
  for(const row of support) {
    if(row.labels.length!==n || row.labels.some(x=>x!=='A'&&x!=='B') || seen.has(row.labels.join('')) || row.weight.denominator<=0n || row.weight.numerator<=0n || row.weight.numerator>row.weight.denominator) throw new Error('invalid_support');
    seen.add(row.labels.join('')); total=add(total,row.weight);
  }
  if(!equal(total,rational(1n))) throw new Error('invalid_support');
}
export const safeValue=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const PotentialTaskSchema=z.strictObject({taskId:id,assigneeId:id,timeIndex:safeValue,yA:safeValue,yB:safeValue,successA:z.boolean(),successB:z.boolean(),usageCoverage:z.enum(['complete','partial','missing','error','excluded','unmeasurable']),qualityState:z.enum(['complete','missing','pending'])});
export type PotentialTask=z.infer<typeof PotentialTaskSchema>;
export const StudyCaseSchema=z.strictObject({
  caseId:id,design:DesignSchema,population:z.array(PotentialTaskSchema).max(16),origin:z.literal('synthetic'),
  grouping:z.enum(['original_assignment','actual_only']),enrollment:z.enum(['fixed','adaptive','unknown']),
  history:z.enum(['no_interference','carryover','unknown']),truncation:z.enum(['independent_fixed','outcome_dependent','unknown']),
});
export type StudyCase=z.infer<typeof StudyCaseSchema>;

const rationalJson=z.strictObject({numerator:z.string(),denominator:z.string()}).refine(value=>{try{decodeRational(value);return true;}catch{return false;}});
const probabilityJson=rationalJson.refine(value=>{try{decodeRational(value,true);return true;}catch{return false;}});
const countsSchema=z.strictObject({cases:safeValue,rejected_cases:safeValue,statistics:safeValue,tails:safeValue,expectations:safeValue,calibrations:safeValue});
export const EvidenceSchema=z.strictObject({
  schema_version:z.literal(1),status:z.enum(['pass','fail']),
  settings:z.strictObject({design_version:z.literal('balanced-prefix-1'),method_version:z.literal('ht-sharp-null-1'),case_version:z.literal('synthetic-grid-1'),block_sizes:z.array(safeValue),max_strata:safeValue,max_blocks:safeValue,max_tasks:safeValue,max_full_queues:safeValue,max_tail_operations:safeValue,alphas:z.array(z.string()),comparison:z.literal('exact'),tail:z.literal('inclusive_two_sided_fixed_observations'),r10_status:z.literal('unvalidated'),adoption:z.literal('inconclusive')}),
  provenance:z.strictObject({design_sha256:z.string().regex(/^[a-f0-9]{64}$/),cases_sha256:z.string().regex(/^[a-f0-9]{64}$/),files:z.array(z.strictObject({path:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/)})),settings_sha256:z.string().regex(/^[a-f0-9]{64}$/),source_sha256:z.string().regex(/^[a-f0-9]{64}$/)}),
  runtime:z.strictObject({node:z.string(),npm:z.string(),lockfile_version:safeValue,typescript:z.string(),zod:z.string()}),
  r10_status:z.literal('unvalidated'),adoption:z.literal('inconclusive'),expected_counts:countsSchema,counts:countsSchema,failures:z.array(z.string()),
  cases:z.array(z.strictObject({case_id:z.string(),classification:z.enum(['sharp_null','non_null_imputation_only']),support_count:safeValue,target:rationalJson,expectation:rationalJson,calibrations:z.array(z.strictObject({alpha:probabilityJson,rejection_probability:probabilityJson}))})),
  rejected_cases:z.array(z.strictObject({case_id:z.string(),status:z.literal('rejected_domain'),expected_reason:z.string(),reason_codes:z.array(z.string())})),
  supported_domain:z.literal('fixed_synthetic_balanced_prefix_complete_outcomes'),unsupported_domains:z.array(z.string()),
});
