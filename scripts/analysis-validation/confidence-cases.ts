import { parseDomain } from './confidence-contracts.js';
import { rational } from './contracts.js';
import { observedIds } from './design.js';
import type { StudyDesign } from './contracts.js';
import type { EndpointDomain,EndpointSchedule } from './confidence-contracts.js';
export const alphas=[rational(1n,40n),rational(1n,20n),rational(1n,10n),rational(1n,4n),rational(1n,2n)];
export const familyAlphas=[rational(1n,20n),rational(1n,10n)];
export function confidenceDesigns():{id:string;design:StudyDesign}[]{
  const build=(id:string,b:2|4|8,counts:number[][])=>({id,design:{blockSize:b,strata:counts.map((blocks,s)=>({stratumId:`s${s}`,blocks:blocks.map((r,j)=>({blockId:`s${s}b${j}`,scheduledTaskIds:Array.from({length:b},(_,i)=>`s${s}b${j}t${i}`),observationMask:Array.from({length:b},(_,i)=>i<r)}))}))}});
  return [build('b2r1',2,[[1]]),build('b2r2',2,[[2]]),...[1,2,3,4].map(r=>build(`b4r${r}`,4,[[r]])),build('two-b2-full',2,[[2,2]]),build('two-b2-strata',2,[[2],[1]]),build('b8r4',8,[[4]])];
}
export function truthTables(n:number,domain:EndpointDomain):{id:string;schedule:EndpointSchedule}[]{
  const l=parseDomain(domain).lattice.length;
  if(!Number.isInteger(n)||n<1||n>4||![2,3].includes(l))throw new Error('confidence_resource_limit');
  return Array.from({length:l**(2*n)},(_,id)=>{
    let code=id;const potentialA:number[]=[],potentialB:number[]=[];
    for(let i=0;i<n;i++){potentialA.push(code%l);code=Math.floor(code/l);potentialB.push(code%l);code=Math.floor(code/l);}
    return {id:String(id),schedule:{potentialA,potentialB}};
  });
}
export function coupledCases(designId:string,n:number){
  const u=[[[0,0]],[[2,2]],[[0,2]],[[2,0]],[[0,1],[1,0],[1,2],[2,1]],[[0,0],[1,1],[2,2],[1,1]]];
  const q=[[[0,0]],[[1,1]],[[0,1]],[[1,0]],[[0,1],[1,0],[0,1],[1,0]],[[1,0],[0,1],[1,0],[0,1]]];
  const expand=(pairs:number[][],invert:boolean):EndpointSchedule=>({potentialA:Array.from({length:n},(_,i)=>invert?1-pairs[i%pairs.length]![0]!:pairs[i%pairs.length]![0]!),potentialB:Array.from({length:n},(_,i)=>invert?1-pairs[i%pairs.length]![1]!:pairs[i%pairs.length]![1]!)});
  return u.flatMap((pairs,t)=>[false,true].map(inverted=>({id:`${designId}:template${t}:${inverted?'inverted':'original'}`,usage:expand(pairs,false),quality:expand(q[t]!,inverted),taskAnnotations:Array.from({length:n},(_,i)=>({assigneeId:`assignee${i%2}`,timeIndex:i}))})));
}
export const designManifest=()=>confidenceDesigns().map(({id,design})=>({id,design,retainedTaskIds:observedIds(design)}));
