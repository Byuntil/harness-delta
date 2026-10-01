import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { builtInCases,caseVersion,rejectionCases,designGrid } from './cases.js';
import { assessStudyCase } from './eligibility.js';
import { enumerateDesign } from './design.js';
import { EvidenceSchema,add,multiply,rational,equal,lessEqual,encodeRational } from './contracts.js';
import { computeStatistic,realize,referenceTail } from './statistics.js';
import { oracleDesign,oracleRealize,oracleStatistic,oracleTail,oracleAdd,fraction } from '../../tests/helpers/analysis-oracle.js';
export const sourceFiles=[
  'scripts/analysis-validation/contracts.ts','scripts/analysis-validation/design.ts','scripts/analysis-validation/statistics.ts',
  'scripts/analysis-validation/eligibility.ts','scripts/analysis-validation/cases.ts','scripts/analysis-validation/runner.ts',
  'tests/helpers/analysis-oracle.ts','tests/comparison-analysis-design.test.ts','tests/comparison-analysis-statistics.test.ts','tests/comparison-analysis-evidence.test.ts',
  'scripts/analysis-validation-command.mjs','scripts/analysis-validation/tsconfig.json','tsconfig.json','tsconfig.build.json',
  'package.json','package-lock.json','docs/decisions/009-comparison-analysis-validation.md',
] as const;
export const settings={design_version:'balanced-prefix-1',method_version:'ht-sharp-null-1',case_version:caseVersion,block_sizes:[2,4,6,8],max_strata:2,max_blocks:4,max_tasks:16,max_full_queues:4096,max_tail_operations:1_000_000,alphas:['1/20','1/10'],comparison:'exact',tail:'inclusive_two_sided_fixed_observations',r10_status:'unvalidated',adoption:'inconclusive'} as const;
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export function provenance(){
  const files=sourceFiles.map(path=>({path,sha256:sha(Buffer.concat([Buffer.from(`${path}\0`),readFileSync(path)]))}));
  return {files,design_sha256:sha(JSON.stringify(designGrid())),cases_sha256:sha(JSON.stringify({eligible:builtInCases(),rejected:rejectionCases()})),settings_sha256:sha(JSON.stringify(settings)),source_sha256:sha(JSON.stringify(files))};
}
export function verifyRegistry(expected:readonly string[],actual:readonly string[]):boolean {
  return new Set(expected).size===expected.length&&new Set(actual).size===actual.length&&expected.length===actual.length&&expected.every(x=>actual.includes(x));
}
export const expectedCounts={cases:432,rejected_cases:26,statistics:7272,tails:7272,expectations:432,calibrations:432};
const designIds=[...[2,4,6,8].flatMap(b=>Array.from({length:b},(_,i)=>`b${b}r${i+1}`)),'two-full','full-one','two-strata','reversed-names'];
const expectedCaseIds=designIds.flatMap(d=>['zero','constant','heterogeneous-null','decrease','increase','heterogeneous-effect'].flatMap(s=>['base','user-offset','time-trend'].map(v=>`${d}-${s}-${v}`)));
const expectedSharpIds=new Set(designIds.flatMap(d=>['zero','constant','heterogeneous-null'].flatMap(s=>['base','user-offset','time-trend'].map(v=>`${d}-${s}-${v}`))));
const expectedRejectedIds=['usage-partial','usage-missing','usage-error','usage-excluded','usage-unmeasurable','quality-missing','quality-pending','grouping-actual_only','enrollment-adaptive','enrollment-unknown','history-carryover','history-unknown','truncation-outcome_dependent','truncation-unknown','real-origin','requested-interval','missing-id','reordered-ids','duplicate-id','interior-hole','unequal-arm-missingness','high-usage-missingness','queue-bound','operation-bound','empty-population','unknown-block-order'];
export function runStudy(){
  const failures:string[]=[],counts={cases:0,rejected_cases:0,statistics:0,tails:0,expectations:0,calibrations:0};
  const cases=[],rejected=[];
  const check=(ok:boolean,id:string)=>{if(!ok)failures.push(id);};
  for(const c of builtInCases()) {
    counts.cases++;
    try {
      if(assessStudyCase(c).status!=='eligible')throw new Error('domain');
      const support=enumerateDesign(c.design),oracle=oracleDesign(c.design);
      check(verifyRegistry(oracle.map(x=>x.labels.join('')),support.map(x=>x.labels.join(''))),`${c.caseId}:support_keys`);
      check(support.every((row,i)=>oracle[i]!==undefined&&row.labels.join('')===oracle[i].labels.join('')&&equal(row.weight,oracle[i].weight)),`${c.caseId}:support_mass`);
      const sharp=c.population.every(x=>x.yA===x.yB),alphas=[rational(1n,20n),rational(1n,10n)],rejections=[rational(0n),rational(0n)];
      check(sharp===expectedSharpIds.has(c.caseId),`${c.caseId}:classification_registry`);
      let expectation=rational(0n),oracleExpectation=fraction(0n);
      const executedChecks:string[]=[];
      for(const row of support) {
        const y=realize(row.labels,c.population),otherY=oracleRealize(row.labels,c.population),key=row.labels.join('');
        const t=computeStatistic(row.labels,y),otherT=oracleStatistic(row.labels,otherY);
        check(JSON.stringify(y)===JSON.stringify(otherY)&&equal(t,otherT),`${c.caseId}:statistic:${key}`);counts.statistics++;executedChecks.push(`statistic:${key}`);
        const tail=referenceTail(support,y,row.labels),otherTail=oracleTail(oracle,otherY,row.labels);
        check(equal(tail,otherTail),`${c.caseId}:tail:${key}`);counts.tails++;executedChecks.push(`tail:${key}`);
        expectation=add(expectation,multiply(row.weight,t));
        const oracleWeight=oracle.find(x=>x.labels.join('')===key)!.weight;
        oracleExpectation=oracleAdd(oracleExpectation,fraction(oracleWeight.numerator*otherT.numerator,oracleWeight.denominator*otherT.denominator));
        if(sharp)alphas.forEach((alpha,i)=>{if(lessEqual(tail,alpha))rejections[i]=add(rejections[i]!,row.weight);});
      }
      const keys=oracle.map(x=>x.labels.join(''));
      const expectedChecks=[...keys.flatMap(key=>[`statistic:${key}`,`tail:${key}`]),'expectation',...(expectedSharpIds.has(c.caseId)?['calibration:0','calibration:1']:[])];
      const target=rational(c.population.reduce((sum,t)=>sum+BigInt(t.yB)-BigInt(t.yA),0n),BigInt(c.population.length));
      check(equal(expectation,target)&&equal(oracleExpectation,target),`${c.caseId}:expectation`);counts.expectations++;executedChecks.push('expectation');
      const calibrations=sharp?alphas.map((alpha,i)=>{check(lessEqual(rejections[i]!,alpha),`${c.caseId}:calibration:${i}`);counts.calibrations++;executedChecks.push(`calibration:${i}`);return {alpha:encodeRational(alpha),rejection_probability:encodeRational(rejections[i]!)};}):[];
      check(verifyRegistry(expectedChecks,executedChecks),`${c.caseId}:check_registry`);
      cases.push({case_id:c.caseId,classification:sharp?'sharp_null':'non_null_imputation_only',support_count:support.length,target:encodeRational(target),expectation:encodeRational(expectation),calibrations});
    }catch{failures.push(`${c.caseId}:evaluation_failed`);}
  }
  for(const c of rejectionCases()) {
    const result=assessStudyCase(c.input);counts.rejected_cases++;
    check(result.status==='rejected'&&result.reasonCodes.length===1&&result.reasonCodes[0]===c.reason,`${c.id}:rejection`);
    rejected.push({case_id:c.id,status:'rejected_domain',expected_reason:c.reason,reason_codes:result.status==='rejected'?result.reasonCodes:[]});
  }
  check(verifyRegistry(expectedCaseIds,cases.map(x=>x.case_id)),'case_registry');
  check(verifyRegistry(expectedRejectedIds,rejected.map(x=>x.case_id)),'rejection_registry');
  check(JSON.stringify(counts)===JSON.stringify(expectedCounts),'check_counts');
  const lock=JSON.parse(readFileSync('package-lock.json','utf8')) as {lockfileVersion:number;packages:Record<string,{version?:string}>};
  return EvidenceSchema.parse({schema_version:1,status:failures.length?'fail':'pass',settings,provenance:provenance(),runtime:{node:process.versions.node,npm:execFileSync(process.platform==='win32'?'npm.cmd':'npm',['--version'],{encoding:'utf8'}).trim(),lockfile_version:lock.lockfileVersion,typescript:lock.packages['node_modules/typescript']!.version,zod:lock.packages['node_modules/zod']!.version},r10_status:'unvalidated',adoption:'inconclusive',expected_counts:expectedCounts,counts,failures,cases,rejected_cases:rejected,supported_domain:'fixed_synthetic_balanced_prefix_complete_outcomes',unsupported_domains:['average_effect_intervals','missingness_methods','adaptive_enrollment','carryover','ratio_intervals','quality_noninferiority','joint_adoption','real_admission']});
}
export function main():number {
  if(process.argv.length!==2){process.stdout.write('{"status":"fail","failures":["unknown_arguments"]}\n');return 1;}
  try{const evidence=runStudy();process.stdout.write(`${JSON.stringify(evidence,null,2)}\n`);return evidence.status==='pass'?0:1;}
  catch{process.stdout.write('{"status":"fail","failures":["study_execution_failed"]}\n');return 1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=main();
