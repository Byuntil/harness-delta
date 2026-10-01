import { add,equal,lessEqual,rational } from './contracts.js';
import { enumerateDesign,observedIds } from './design.js';
import { confidenceDesign,observationSchema,parseDomain,scheduleSchema } from './confidence-contracts.js';
import { setFromEnvelopes,validateFraction } from './confidence-contracts.js';
import type { Rational } from './contracts.js';
import type { Envelope,EndpointObservation,EndpointSchedule } from './confidence-contracts.js';
export function compatibleSchedules(designInput:unknown,observationInput:unknown,domainInput:unknown):EndpointSchedule[]{
  const domain=parseDomain(domainInput),design=confidenceDesign(designInput,domain),parsed=observationSchema.safeParse(observationInput);
  if(!parsed.success)throw new Error('invalid_observation');
  const observation=parsed.data;
  if(JSON.stringify(observedIds(design))!==JSON.stringify(observation.taskIds)||observation.labels.length!==observation.taskIds.length||observation.values.length!==observation.taskIds.length)throw new Error('observation_alignment');
  if(observation.values.some(x=>!domain.lattice.includes(x)))throw new Error('invalid_outcomes');
  if(!enumerateDesign(design).some(x=>x.labels.join('')===observation.labels.join('')))throw new Error('observed_outside_support');
  let schedules:EndpointSchedule[]=[{potentialA:[],potentialB:[]}];
  for(let i=0;i<observation.values.length;i++)schedules=schedules.flatMap(h=>domain.lattice.map(hidden=>({potentialA:[...h.potentialA,observation.labels[i]==='A'?observation.values[i]!:hidden],potentialB:[...h.potentialB,observation.labels[i]==='B'?observation.values[i]!:hidden]})));
  return schedules;
}
export function scheduleTarget(input:unknown){
  const parsed=scheduleSchema.safeParse(input);
  if(!parsed.success||parsed.data.potentialA.length!==parsed.data.potentialB.length)throw new Error('invalid_schedule');
  const h=parsed.data;return rational(h.potentialB.reduce((sum,b,i)=>sum+BigInt(b-h.potentialA[i]!),0n),BigInt(h.potentialA.length));
}

// One evaluator owns a fixed design/domain. Its caches never receive hidden truth.
export function createConfidenceEvaluator(designInput:unknown,domainInput:unknown){
  const domain=parseDomain(domainInput),design=confidenceDesign(designInput,domain),support=enumerateDesign(design),n=observedIds(design).length,m=domain.lattice.length-1;
  const completedCache=new Map<string,{target:Rational;discrepancies:bigint[]}>();
  const observationCache=new Map<string,Envelope[]>();
  let referenceRows=0;
  function envelopes(observationInput:unknown):Envelope[]{
    const parsed=observationSchema.safeParse(observationInput);
    if(!parsed.success)throw new Error('invalid_observation');
    const observation:EndpointObservation=parsed.data,key=JSON.stringify(observation);
    const previous=observationCache.get(key);if(previous)return structuredClone(previous);
    const schedules=compatibleSchedules(design,observation,domain);
    const observedIndex=support.findIndex(x=>x.labels.join('')===observation.labels.join(''));
    const rows:Envelope[]=Array.from({length:2*m*n+1},(_,i)=>({target:rational(BigInt(i-m*n),BigInt(n)),value:rational(0n),compatibleCount:0,status:'infeasible_target'}));
    for(const h of schedules){
      const scheduleKey=JSON.stringify(h);let cached=completedCache.get(scheduleKey);
      if(!cached){
        const target=scheduleTarget(h),sumDelta=h.potentialB.reduce((sum,b,i)=>sum+BigInt(b-h.potentialA[i]!),0n);
        // Every discrepancy has common denominator N; compare exact integer numerators.
        const discrepancies=support.map(row=>{
          let t=0n;row.labels.forEach((arm,i)=>{t+=arm==='B'?2n*BigInt(h.potentialB[i]!):-2n*BigInt(h.potentialA[i]!);});
          const delta=t-sumDelta;return delta<0n?-delta:delta;
        });
        cached={target,discrepancies};completedCache.set(scheduleKey,cached);
      }
      let tail=rational(0n);
      for(let j=0;j<support.length;j++){
        referenceRows++;
        if(cached.discrepancies[j]!>=cached.discrepancies[observedIndex]!)tail=add(tail,support[j]!.weight);
      }
      const entry=rows.find(x=>equal(x.target,cached.target))!;
      entry.compatibleCount++;entry.status='evaluated';if(lessEqual(entry.value,tail))entry.value=tail;
    }
    observationCache.set(key,rows);return structuredClone(rows);
  }
  return {envelopes,set:(observation:unknown,alpha:Rational)=>setFromEnvelopes(envelopes(observation),alpha),work:()=>({referenceRows,completedSchedules:completedCache.size,observations:observationCache.size})};
}
export function envelopeTail(design:unknown,observation:unknown,domain:unknown,target:Rational){
  validateFraction(target);
  const rows=createConfidenceEvaluator(design,domain).envelopes(observation),row=rows.find(x=>equal(x.target,target));
  return row?{value:row.value,compatibleCount:row.compatibleCount,status:row.status}:{value:rational(0n),compatibleCount:0,status:'infeasible_target' as const};
}
export function confidenceSet(design:unknown,observation:unknown,domain:unknown,alpha:Rational){
  return createConfidenceEvaluator(design,domain).set(observation,alpha);
}
