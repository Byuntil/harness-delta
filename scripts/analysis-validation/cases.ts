import type { StudyCase, StudyDesign } from './contracts.js';
export const caseVersion='synthetic-grid-1';
export function makeDesign(b:number,prefixes:number[][]):StudyDesign {
  return {blockSize:b as StudyDesign['blockSize'],strata:prefixes.map((rs,s)=>({stratumId:`s${s}`,blocks:rs.map((r,j)=>({blockId:`s${s}b${j}`,scheduledTaskIds:Array.from({length:b},(_,i)=>`s${s}b${j}t${i}`),observationMask:Array.from({length:b},(_,i)=>i<r)}))}))};
}
export function designGrid():{id:string;design:StudyDesign}[] {
  const rows=[2,4,6,8].flatMap(b=>Array.from({length:b},(_,i)=>({id:`b${b}r${i+1}`,design:makeDesign(b,[[i+1]])})));
  rows.push({id:'two-full',design:makeDesign(4,[[4,4]])},{id:'full-one',design:makeDesign(4,[[4,1]])},{id:'two-strata',design:makeDesign(4,[[1],[2]])});
  const reverse=makeDesign(4,[[1],[2]]);
  // Reverse names, never explicit positions or memberships.
  reverse.strata.forEach((s,i)=>{s.stratumId=`z${1-i}`;s.blocks.forEach(b=>{b.blockId=`z${1-i}`;b.scheduledTaskIds=b.scheduledTaskIds.map((_,j)=>`z${1-i}t${3-j}`);});});
  rows.push({id:'reversed-names',design:reverse}); return rows;
}
export const scenarioNames=['zero','constant','heterogeneous-null','decrease','increase','heterogeneous-effect'] as const;
export const variantNames=['base','user-offset','time-trend'] as const;
export function builtInCases():StudyCase[] {
  const bases:number[][]=[[0,0,0,0],[7,7,7,7],[0,1,4,9],[10,20,30,40],[10,20,30,40],[10,20,30,40]];
  const treatments:number[][]=[bases[0]!,bases[1]!,bases[2]!,[5,15,25,35],[15,25,35,45],[5,25,25,45]];
  return designGrid().flatMap(({id,design})=>scenarioNames.flatMap((scenario,k)=>variantNames.map(variant=>({
    caseId:`${id}-${scenario}-${variant}`,design,origin:'synthetic' as const,grouping:'original_assignment' as const,enrollment:'fixed' as const,history:'no_interference' as const,truncation:'independent_fixed' as const,
    population:design.strata.flatMap(s=>s.blocks.flatMap(b=>b.scheduledTaskIds.filter((_,i)=>b.observationMask[i]))).map((taskId,i)=>{
      const offset=variant==='user-offset'?(i%2)*100:variant==='time-trend'?i*10:0;
      return {taskId,assigneeId:`user${i%2}`,timeIndex:i,yA:bases[k]![i%4]!+offset,yB:treatments[k]![i%4]!+offset,successA:i%3!==0,successB:i%3!==0,usageCoverage:'complete' as const,qualityState:'complete' as const};
    }),
  }))));
}

// Fixed rejection registry. No external cases, report, store, or session imports.
export function rejectionCases():{id:string;input:unknown;reason:string}[] {
  const base=builtInCases().find(c=>c.caseId==='b4r4-decrease-base')!;
  const rows:{id:string;input:unknown;reason:string}[]=[];
  for(const state of ['partial','missing','error','excluded','unmeasurable'] as const) {
    const c=structuredClone(base);c.population[0]!.usageCoverage=state;
    rows.push({id:`usage-${state}`,input:c,reason:'incomplete_usage'});
  }
  for(const state of ['missing','pending'] as const){const c=structuredClone(base);c.population[0]!.qualityState=state;rows.push({id:`quality-${state}`,input:c,reason:'incomplete_quality'});}
  for(const [key,values,reason] of [['grouping',['actual_only'],'unsupported_grouping'],['enrollment',['adaptive','unknown'],'unsupported_enrollment'],['history',['carryover','unknown'],'unsupported_history'],['truncation',['outcome_dependent','unknown'],'unsupported_truncation']] as const)
    for(const value of values)rows.push({id:`${key}-${value}`,input:{...base,[key]:value},reason});
  rows.push({id:'real-origin',input:{...base,origin:'real'},reason:'invalid_case'},{id:'requested-interval',input:{...base,interval:true},reason:'invalid_case'});
  for(const [id,population] of [['missing-id',base.population.slice(1)],['reordered-ids',[...base.population].reverse()],['duplicate-id',[...base.population,base.population[0]!]]] as const)rows.push({id,input:{...base,population},reason:'population_alignment'});
  const hole=structuredClone(base);hole.design.strata[0]!.blocks[0]!.observationMask=[true,false,true,false];
  rows.push({id:'interior-hole',input:hole,reason:'non_prefix'});
  const unequal=structuredClone(base);unequal.population[2]!.usageCoverage='missing';unequal.population[3]!.usageCoverage='missing';
  rows.push({id:'unequal-arm-missingness',input:unequal,reason:'incomplete_usage'});
  const selective=structuredClone(base);selective.population[3]!.usageCoverage='missing';rows.push({id:'high-usage-missingness',input:selective,reason:'incomplete_usage'});
  rows.push({id:'queue-bound',input:{...base,design:makeDesign(8,[[8,0]])},reason:'resource_limit'}, {id:'operation-bound',input:{...base,design:makeDesign(6,[[6,6]])},reason:'operation_limit'}, {id:'empty-population',input:{...base,design:makeDesign(4,[[0]]),population:[]},reason:'empty_population'});
  const order=makeDesign(4,[[1,4]]);rows.push({id:'unknown-block-order',input:{...base,design:order},reason:'invalid_block_order'});
  return rows;
}
