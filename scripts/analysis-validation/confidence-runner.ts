import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { add,multiply,rational,equal,lessEqual } from './contracts.js';
import type { Rational } from './contracts.js';
import { observedIds,enumerateDesign } from './design.js';
import { domains,parseDomain,confidenceDesign,setFromEnvelopes,validateFraction,ConfidenceEvidenceSchema } from './confidence-contracts.js';
import type { EndpointSchedule,ConfidenceSet } from './confidence-contracts.js';
import { alphas,familyAlphas,confidenceDesigns,truthTables,coupledCases,designManifest } from './confidence-cases.js';
import { compatibleSchedules,createConfidenceEvaluator,scheduleTarget } from './confidence.js';
import { oracleCalibration,oracleSet,oracleTarget,oracleObserved } from '../../tests/helpers/confidence-oracle.js';
export const serialize=(input:unknown):string=>JSON.stringify(input,(_,v:unknown)=>typeof v==='bigint'?v.toString():v);
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export function verifyIdentities(expected:readonly string[],actual:readonly string[]):boolean {
  const e=new Set(expected),a=new Set(actual);return e.size===expected.length&&a.size===actual.length&&a.size===e.size&&expected.every(x=>a.has(x));
}
const keyOf=(labels:readonly string[],values:readonly number[])=>`${labels.join('')}:${values.join(',')}`;
const fractionKey=(r:Rational)=>`${r.numerator}/${r.denominator}`;
const has=(set:ConfidenceSet,target:Rational)=>set.values.some(x=>equal(x,target));
const subtract=(a:Rational,b:Rational)=>add(a,rational(-b.numerator,b.denominator));
function audit(expected:string[],executed:string[]){
  return {expected_count:expected.length,executed_count:executed.length,expected_sha256:sha(serialize([...expected].sort())),executed_sha256:sha(serialize([...executed].sort())),matches:verifyIdentities(expected,executed)};
}
interface Range {minimum:Rational;maximum:Rational;minimumWitness:string;maximumWitness:string}
function rangeUpdate(range:Range|undefined,value:Rational,id:string):Range {
  if(!range)return {minimum:value,maximum:value,minimumWitness:id,maximumWitness:id};
  if(!lessEqual(range.minimum,value)){range.minimum=value;range.minimumWitness=id;}
  if(!lessEqual(value,range.maximum)){range.maximum=value;range.maximumWitness=id;}
  return range;
}
export function calibrateEndpoint(designInput:unknown,domainInput:unknown,levels:readonly Rational[]){
  const domain=parseDomain(domainInput),design=confidenceDesign(designInput,domain),n=observedIds(design).length;
  levels.forEach(a=>validateFraction(a,true));
  const candidate=createConfidenceEvaluator(design,domain),oracle=oracleCalibration(design,domain),tables=truthTables(n,domain),support=enumerateDesign(design);
  const failures:string[]=[],check=(ok:boolean,id:string)=>{if(!ok)failures.push(id);};
  check(serialize(levels.map(fractionKey))===serialize(['1/40','1/20','1/10','1/4','1/2']),'alpha_registry');
  const counts={truth_tables:tables.length,observations:0,envelopes:0,sets:0,coverage_checks:0,coverage_paths:0,reference_rows:0};
  const expectedChecks:string[]=[],executedChecks:string[]=[],coverageIds:string[]=[],expectedCoverageIds=oracle.tables.flatMap(t=>levels.map(a=>`${t.id}:${fractionKey(a)}`));
  check(verifyIdentities(oracle.tables.map(x=>x.id),tables.map(x=>x.id)),'truth_registry');
  check(serialize(tables)===serialize(oracle.tables),'truth_contents');
  check(serialize(support)===serialize(oracle.support),'support_weights');
  const cachedSets=new Map<string,ConfidenceSet[]>(),envelopeDigest=createHash('sha256'),coverageDigest=createHash('sha256');
  // Enumerate candidate observations independently from oracle global-table indexing.
  const vectors:number[][]=[];
  const branch=(prefix:number[])=>{if(prefix.length===n){vectors.push(prefix);return;}for(const x of domain.lattice)branch([...prefix,x]);};branch([]);
  for(const row of support)for(const values of vectors){
    const key=keyOf(row.labels,values),observation={taskIds:observedIds(design),labels:row.labels,values};
    const actual=candidate.envelopes(observation),expected=oracle.observations.get(key);
    counts.observations++;check(expected!==undefined,`observation:${key}`);
    actual.forEach(x=>{const id=`${key}:target:${fractionKey(x.target)}`;executedChecks.push(id);counts.envelopes++;});
    if(expected)check(serialize(actual)===serialize(expected.envelopes),`envelope:${key}`);
    const sets=levels.map(alpha=>{
      const result=setFromEnvelopes(actual,alpha),id=`${key}:alpha:${fractionKey(alpha)}`;executedChecks.push(id);counts.sets++;
      if(expected)check(serialize(result)===serialize(oracleSet(expected.envelopes,alpha)),`set:${id}`);
      check(result.compatibleValues.length===(domain.lattice.length-1)*n+1&&equal(result.diagnostics.compatibilityHullWidth,rational(BigInt(domain.lattice.length-1))),`compatibility_width:${id}`);
      return result;
    });
    cachedSets.set(key,sets);envelopeDigest.update(serialize({key,actual,sets}));
  }
  for(const [key,entry] of oracle.observations){
    expectedChecks.push(...entry.envelopes.map(x=>`${key}:target:${fractionKey(x.target)}`),...levels.map(a=>`${key}:alpha:${fractionKey(a)}`));
    // Compare exact schedule membership, not only compatible counts.
    const expectedSchedules=oracle.index.get(key)!.tables.map(x=>serialize(x.schedule)).sort();
    // Candidate completion is also the actual envelope's nuisance enumeration.
    check(serialize(expectedSchedules)===serialize(compatibleSchedules(design,entry.observation,domain).map(serialize).sort()),`compatibility_schedules:${key}`);
  }
  const summaries=levels.map(alpha=>({alpha,coverage:undefined as Range|undefined,missProbability:undefined as Range|undefined,emptyProbability:undefined as Range|undefined,noInferentialNarrowingProbability:undefined as Range|undefined,expectedCompatibleCount:undefined as Range|undefined,expectedAcceptedCount:undefined as Range|undefined,expectedRemovedCount:undefined as Range|undefined,expectedCompatibilityWidth:undefined as Range|undefined,expectedConfidenceWidthNonempty:undefined as Range|undefined}));
  for(const table of tables){
    const target=scheduleTarget(table.schedule),expectedTable=oracle.tables.find(x=>x.id===table.id);
    check(expectedTable!==undefined&&equal(target,oracleTarget(expectedTable.schedule)),`truth_target:${table.id}`);
    // One observed-dataset cache lookup per truth/path; all alpha sets travel together.
    const truthPaths=support.map(row=>{
      const values=row.labels.map((arm,i)=>arm==='A'?table.schedule.potentialA[i]!:table.schedule.potentialB[i]!);
      const key=keyOf(row.labels,values);counts.coverage_paths++;
      if(expectedTable)check(serialize(values)===serialize(oracleObserved(expectedTable.schedule,row.labels)),`realization:${table.id}:${key}`);
      return {row,key,sets:cachedSets.get(key)};
    });
    for(const [ai,alpha] of levels.entries()){
      const id=`${table.id}:${fractionKey(alpha)}`;coverageIds.push(id);counts.coverage_checks++;
      let coverage=rational(0n),empty=rational(0n),noNarrow=rational(0n),compatibleCount=rational(0n),acceptedCount=rational(0n),removedCount=rational(0n),compatibilityWidth=rational(0n),confidenceWidth=rational(0n);
      const paths:string[]=[];
      for(const {row,key,sets} of truthPaths){
        const set=sets?.[ai];paths.push(row.labels.join(''));
        if(!set){check(false,`coverage_observation:${id}:${key}`);continue;}
        if(has(set,target))coverage=add(coverage,row.weight);
        if(!set.values.length)empty=add(empty,row.weight);
        if(set.diagnostics.noInferentialNarrowing)noNarrow=add(noNarrow,row.weight);
        compatibleCount=add(compatibleCount,multiply(row.weight,rational(BigInt(set.diagnostics.compatibleTargetCount))));
        acceptedCount=add(acceptedCount,multiply(row.weight,rational(BigInt(set.diagnostics.acceptedTargetCount))));
        removedCount=add(removedCount,multiply(row.weight,rational(BigInt(set.diagnostics.removedCompatibleTargetCount))));
        compatibilityWidth=add(compatibilityWidth,multiply(row.weight,set.diagnostics.compatibilityHullWidth));
        if(set.diagnostics.confidenceHullWidth)confidenceWidth=add(confidenceWidth,multiply(row.weight,set.diagnostics.confidenceHullWidth));
      }
      check(verifyIdentities(oracle.support.map(x=>x.labels.join('')),paths),`coverage_paths:${id}`);
      check(lessEqual(subtract(rational(1n),alpha),coverage),`coverage:${id}`);
      const summary=summaries[ai]!;
      const metrics={coverage,missProbability:subtract(rational(1n),coverage),emptyProbability:empty,noInferentialNarrowingProbability:noNarrow,expectedCompatibleCount:compatibleCount,expectedAcceptedCount:acceptedCount,expectedRemovedCount:removedCount,expectedCompatibilityWidth:compatibilityWidth};
      for(const k of Object.keys(metrics) as (keyof typeof metrics)[])summary[k]=rangeUpdate(summary[k],metrics[k],table.id);
      // Conditional width avoids silently treating an empty set as width zero.
      const nonempty=subtract(rational(1n),empty);
      const conditionalWidth=nonempty.numerator?multiply(confidenceWidth,rational(nonempty.denominator,nonempty.numerator)):null;
      if(conditionalWidth)summary.expectedConfidenceWidthNonempty=rangeUpdate(summary.expectedConfidenceWidthNonempty,conditionalWidth,table.id);
      coverageDigest.update(serialize({id,target,...metrics,conditionalConfidenceWidth:conditionalWidth,paths}));
    }
  }
  counts.reference_rows=candidate.work().referenceRows;
  const expectedCounts={truth_tables:oracle.tables.length,observations:oracle.observations.size,envelopes:oracle.observations.size*(2*(domain.lattice.length-1)*n+1),sets:oracle.observations.size*levels.length,coverage_checks:oracle.tables.length*levels.length,coverage_paths:oracle.tables.length*oracle.support.length,reference_rows:oracle.tables.length*oracle.support.length**2};
  check(serialize(counts)===serialize(expectedCounts),'evaluation_counts');check(counts.reference_rows===oracle.referenceRows,'oracle_work_counts');
  const registries={observations_targets_alphas:audit(expectedChecks,executedChecks),truth_alphas:audit(expectedCoverageIds,coverageIds)};
  check(registries.observations_targets_alphas.matches,'observation_target_alpha_registry');check(registries.truth_alphas.matches,'truth_alpha_registry');
  return {endpoint:domain.endpoint,failures,counts,expected_counts:expectedCounts,registries,summaries,envelope_set_sha256:envelopeDigest.digest('hex'),coverage_sha256:coverageDigest.digest('hex'),cache:cachedSets};
}
export function checkCoupledCoverage(designInput:unknown,usage:EndpointSchedule,quality:EndpointSchedule,familyAlpha:Rational){
  validateFraction(familyAlpha,true);const design=confidenceDesign(designInput,domains[0]!),alpha=rational(familyAlpha.numerator,familyAlpha.denominator*2n);
  for(const [i,h] of [usage,quality].entries()){
    if(h.potentialA.length!==observedIds(design).length||h.potentialB.length!==observedIds(design).length)throw new Error('schedule_alignment');
    if([...h.potentialA,...h.potentialB].some(x=>!domains[i]!.lattice.includes(x)))throw new Error('invalid_outcomes');
  }
  const evaluators=domains.map(d=>createConfidenceEvaluator(design,d)),targets=[scheduleTarget(usage),scheduleTarget(quality)];
  let jointCoverage=rational(0n),marginalUsageCoverage=rational(0n),marginalQualityCoverage=rational(0n);
  for(const row of enumerateDesign(design)){
    const included=[usage,quality].map((h,i)=>{
      const values=row.labels.map((arm,j)=>arm==='A'?h.potentialA[j]:h.potentialB[j]);
      return has(evaluators[i]!.set({taskIds:observedIds(design),labels:row.labels,values},alpha),targets[i]!);
    });
    if(included[0])marginalUsageCoverage=add(marginalUsageCoverage,row.weight);
    if(included[1])marginalQualityCoverage=add(marginalQualityCoverage,row.weight);
    if(included.every(Boolean))jointCoverage=add(jointCoverage,row.weight);
  }
  return {jointCoverage,marginalUsageCoverage,marginalQualityCoverage};
}
export const settings={method_version:'bounded-weak-null-envelope-1',design_version:'balanced-prefix-1',case_version:'bounded-full-tables-1',domain_version:'usage012-deadline01-1',alphas:['1/40','1/20','1/10','1/4','1/2'],family_alphas:['1/20','1/10'],max_tasks:4,max_support:16,max_truth_tables:6561,max_completions:81,max_reference_rows:2_000_000,max_coverage_lookups:200_000,r10_status:'unvalidated',adoption:'inconclusive'} as const;
export const confidenceSourceFiles=[
  'scripts/analysis-validation/confidence-contracts.ts','scripts/analysis-validation/confidence-cases.ts','scripts/analysis-validation/confidence.ts','scripts/analysis-validation/confidence-runner.ts',
  'scripts/analysis-validation/contracts.ts','scripts/analysis-validation/design.ts','scripts/analysis-validation/statistics.ts','scripts/analysis-validation/eligibility.ts','scripts/analysis-validation/cases.ts',
  'tests/helpers/confidence-oracle.ts','tests/helpers/analysis-oracle.ts','tests/comparison-confidence-method.test.ts','tests/comparison-confidence-evidence.test.ts',
  'scripts/confidence-validation-command.mjs','scripts/analysis-validation/confidence-tsconfig.json','tsconfig.json','tsconfig.build.json','package.json','package-lock.json','docs/decisions/010-comparison-confidence-validation.md',
] as const;
export function confidenceProvenance(){
  const files=confidenceSourceFiles.map(path=>({path,sha256:sha(Buffer.concat([Buffer.from(`${path}\0`),readFileSync(path)]))}));
  return {files,source_sha256:sha(serialize(files)),settings_sha256:sha(serialize(settings)),design_sha256:sha(serialize(designManifest())),grid_sha256:sha(serialize({domains,alphas,coupled:confidenceDesigns().flatMap(x=>coupledCases(x.id,observedIds(x.design).length))}))};
}
const expectedDesigns=[['b2r1',1,2,2,[[1]]],['b2r2',2,2,2,[[2]]],['b4r1',1,2,4,[[1]]],['b4r2',2,4,4,[[2]]],['b4r3',3,6,4,[[3]]],['b4r4',4,6,4,[[4]]],['two-b2-full',4,4,2,[[2,2]]],['two-b2-strata',3,4,2,[[2],[1]]],['b8r4',4,16,8,[[4]]]] as const;
export function runConfidenceStudy(){
  const failures:string[]=[],endpoints:(Omit<ReturnType<typeof calibrateEndpoint>,'cache'>&{design_id:string})[]=[],coupled=[],executed:string[]=[];
  const check=(ok:boolean,id:string)=>{if(!ok)failures.push(id);};
  const registry=confidenceDesigns();
  check(verifyIdentities(expectedDesigns.map(x=>x[0]),registry.map(x=>x.id)),'design_registry');
  check(serialize(alphas.map(fractionKey))===serialize(settings.alphas),'alpha_registry');
  check(serialize(familyAlphas.map(fractionKey))===serialize(settings.family_alphas),'family_alpha_registry');
  check(serialize(domains)===serialize([{endpoint:'usage',lattice:[0,1,2]},{endpoint:'deadline_success',lattice:[0,1]}]),'domain_registry');
  for(const {id,design} of registry){
    const expected=expectedDesigns.find(x=>x[0]===id),n=observedIds(design).length,support=enumerateDesign(design);
    check(!!expected&&n===expected[1]&&support.length===expected[2]&&design.blockSize===expected[3]&&serialize(design.strata.map(s=>s.blocks.map(b=>b.observationMask.filter(Boolean).length)))===serialize(expected[4]),`${id}:design_definition`);
    const results=domains.map(domain=>{
      const result=calibrateEndpoint(design,domain,alphas),{cache,...evidence}=result;
      failures.push(...result.failures.map(f=>`${id}:${domain.endpoint}:${f}`));endpoints.push({design_id:id,...evidence});executed.push(`${id}:${domain.endpoint}`);return {domain,cache};
    });
    for(const c of coupledCases(id,n))for(const familyAlpha of familyAlphas){
      const marginalAlpha=rational(familyAlpha.numerator,familyAlpha.denominator*2n),ai=alphas.findIndex(x=>equal(x,marginalAlpha));
      let joint=rational(0n),usage=rational(0n),quality=rational(0n);
      const targets=[scheduleTarget(c.usage),scheduleTarget(c.quality)],schedules=[c.usage,c.quality];
      for(const row of support){
        const contained=results.map((result,i)=>{
          const h=schedules[i]!,values=row.labels.map((arm,j)=>arm==='A'?h.potentialA[j]!:h.potentialB[j]!);
          const set=result.cache.get(keyOf(row.labels,values))?.[ai];return !!set&&has(set,targets[i]!);
        });
        if(contained[0])usage=add(usage,row.weight);if(contained[1])quality=add(quality,row.weight);if(contained.every(Boolean))joint=add(joint,row.weight);
      }
      check(lessEqual(subtract(rational(1n),familyAlpha),joint),`${c.id}:${fractionKey(familyAlpha)}:joint_coverage`);
      coupled.push({case_id:c.id,family_alpha:familyAlpha,joint_coverage:joint,marginal_usage_coverage:usage,marginal_quality_coverage:quality,task_annotations:c.taskAnnotations});
    }
  }
  const expectedEndpointIds=expectedDesigns.flatMap(x=>['usage','deadline_success'].map(e=>`${x[0]}:${e}`));
  check(verifyIdentities(expectedEndpointIds,executed),'endpoint_registry');
  const expectedCoupledIds=expectedDesigns.flatMap(x=>Array.from({length:6},(_,i)=>['original','inverted'].flatMap(v=>settings.family_alphas.map(a=>`${x[0]}:template${i}:${v}:${a}`))).flat());
  const coupledAudit=audit(expectedCoupledIds,coupled.map(x=>`${x.case_id}:${fractionKey(x.family_alpha)}`));check(coupledAudit.matches,'coupled_registry');
  const counts={truth_tables:endpoints.reduce((s,x)=>s+x.counts.truth_tables,0),observations:endpoints.reduce((s,x)=>s+x.counts.observations,0),envelopes:endpoints.reduce((s,x)=>s+x.counts.envelopes,0),sets:endpoints.reduce((s,x)=>s+x.counts.sets,0),coverage_checks:endpoints.reduce((s,x)=>s+x.counts.coverage_checks,0),coupled_cases:new Set(coupled.map(x=>x.case_id)).size,coupled_checks:coupled.length};
  const expectedCounts={truth_tables:22257,observations:2970,envelopes:44306,sets:14850,coverage_checks:111285,coupled_cases:108,coupled_checks:216};
  check(serialize(counts)===serialize(expectedCounts),'global_counts');
  const lock=JSON.parse(readFileSync('package-lock.json','utf8')) as {lockfileVersion:number;packages:Record<string,{version?:string}>};
  return {schema_version:1,status:failures.length?'fail':'pass',method:'bounded-weak-null-envelope-1',settings,provenance:confidenceProvenance(),runtime:{node:process.versions.node,npm:execFileSync(process.platform==='win32'?'npm.cmd':'npm',['--version'],{encoding:'utf8'}).trim(),lockfile_version:lock.lockfileVersion,typescript:lock.packages['node_modules/typescript']!.version,zod:lock.packages['node_modules/zod']!.version},expected_counts:expectedCounts,counts,failures,endpoints,coupled,registries:{endpoints:audit(expectedEndpointIds,executed),coupled:coupledAudit},r10_status:'unvalidated',adoption:'inconclusive',supported_domain:'fixed_complete_synthetic_usage012_deadline01_N1to4_nine_designs',unsupported_domains:['ratios','real_token_scale','MNAR','carryover','adaptive_enrollment','informative_stopping','criterion_fulfillment','quality_margin','adoption','real_admission']};
}
// JSON boundary: BigInt fractions become decimal strings; field names snake_case.
export function evidenceJson(value:unknown):unknown {
  if(typeof value==='bigint')return value.toString();
  if(Array.isArray(value))return value.map(evidenceJson);
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`),evidenceJson(v)]));
  return value;
}
export function main():number{
  if(process.argv.length!==2){process.stdout.write('{"status":"fail","failures":["unknown_arguments"]}\n');return 1;}
  try{const evidence=runConfidenceStudy();process.stdout.write(`${JSON.stringify(ConfidenceEvidenceSchema.parse(evidenceJson(evidence)),null,2)}\n`);return evidence.status==='pass'?0:1;}
  catch{process.stdout.write('{"status":"fail","failures":["study_execution_failed"],"r10_status":"unvalidated","adoption":"inconclusive"}\n');return 1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=main();
