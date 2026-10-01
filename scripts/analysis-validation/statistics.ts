import { add, rational, safeValue, validateSupport } from './contracts.js';
import { assertOperationLimit } from './design.js';
import type { AssignmentMass, Label, PotentialTask, Rational } from './contracts.js';
export function computeStatistic(labels:readonly Label[],outcomes:readonly number[]):Rational {
  if(!labels.length||labels.length!==outcomes.length||labels.some(x=>x!=='A'&&x!=='B')||outcomes.some(x=>!safeValue.safeParse(x).success)) throw new Error('invalid_outcomes');
  let total=0n;
  for(let i=0;i<labels.length;i++) total+=(labels[i]==='B'?1n:-1n)*BigInt(outcomes[i]!);
  return rational(2n*total,BigInt(labels.length));
}
export function realize(labels:readonly Label[],population:readonly PotentialTask[]):number[] {
  if(labels.length!==population.length||labels.some(x=>x!=='A'&&x!=='B')) throw new Error('invalid_outcomes');
  return population.map((task,i)=>labels[i]==='A'?task.yA:task.yB);
}
export function referenceTail(support:readonly AssignmentMass[],outcomes:readonly number[],observedLabels:readonly Label[]):Rational {
  validateSupport(support,outcomes.length);assertOperationLimit(outcomes.length,support.length);
  if(!support.some(row=>row.labels.join('')===observedLabels.join(''))) throw new Error('observed_outside_support');
  const observed=computeStatistic(observedLabels,outcomes),abs=(x:bigint)=>x<0n?-x:x;
  let total=rational(0n);
  for(const row of support) {
    const value=computeStatistic(row.labels,outcomes);
    if(abs(value.numerator)*observed.denominator>=abs(observed.numerator)*value.denominator) total=add(total,row.weight);
  }
  return total;
}
export interface ArmReference { taskCount:number;totalUsage:bigint;successCount:number }
export interface RatioReference {value:Rational|null;reason:null|'zero_baseline'|'zero_successes'|'empty_arm'}
export function referenceRatios(a:ArmReference,b:ArmReference):{change:RatioReference;tokensPerSuccessA:RatioReference;tokensPerSuccessB:RatioReference} {
  for(const arm of [a,b]) if(!Number.isSafeInteger(arm.taskCount)||arm.taskCount<0||!Number.isSafeInteger(arm.successCount)||arm.successCount<0||arm.successCount>arm.taskCount||typeof arm.totalUsage!=='bigint'||arm.totalUsage<0n||(arm.taskCount===0&&arm.totalUsage!==0n)) throw new Error('invalid_arm');
  const success=(arm:ArmReference):RatioReference=>arm.taskCount===0?{value:null,reason:'empty_arm'}:arm.successCount===0?{value:null,reason:'zero_successes'}:{value:rational(arm.totalUsage,BigInt(arm.successCount)),reason:null};
  const change:RatioReference=!a.taskCount||!b.taskCount?{value:null,reason:'empty_arm'}:a.totalUsage===0n?{value:null,reason:'zero_baseline'}:{value:rational(b.totalUsage*BigInt(a.taskCount)-a.totalUsage*BigInt(b.taskCount),BigInt(b.taskCount)*a.totalUsage),reason:null};
  return {change,tokensPerSuccessA:success(a),tokensPerSuccessB:success(b)};
}
