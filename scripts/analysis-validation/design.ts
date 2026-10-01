import { DesignSchema, multiply, rational } from './contracts.js';
import type { AssignmentMass, StudyDesign } from './contracts.js';
export function parseDesign(input:unknown):StudyDesign {
  const parsed=DesignSchema.safeParse(input);
  if(!parsed.success) throw new Error('invalid_design');
  const design=parsed.data, tasks=new Set<string>(), blocks=new Set<string>(), strata=new Set<string>();
  let queues=1, count=0, blockCount=0;
  const words=({2:2,4:6,6:20,8:70} as const)[design.blockSize];
  for(const stratum of design.strata) {
    if(strata.has(stratum.stratumId)) throw new Error('duplicate_id');
    strata.add(stratum.stratumId);
    for(const [index,block] of stratum.blocks.entries()) {
      if(blocks.has(block.blockId)) throw new Error('duplicate_id');
      blocks.add(block.blockId); blockCount++; queues*=words;
      if(block.scheduledTaskIds.length!==design.blockSize || block.observationMask.length!==design.blockSize) throw new Error('invalid_design');
      let suffix=false;
      for(const [i,taskId] of block.scheduledTaskIds.entries()) {
        if(tasks.has(taskId)) throw new Error('duplicate_id'); tasks.add(taskId);
        if(!block.observationMask[i]) suffix=true;
        else { if(suffix) throw new Error('non_prefix'); count++; }
      }
      if(index<stratum.blocks.length-1 && suffix) throw new Error('invalid_block_order');
    }
  }
  if(blockCount>4 || count>16 || queues>4096) throw new Error('resource_limit');
  return design;
}
export const observedIds=(design:StudyDesign) => design.strata.flatMap(s=>s.blocks.flatMap(b=>b.scheduledTaskIds.filter((_,i)=>b.observationMask[i])));
export function assertOperationLimit(n:number,supportCount:number):void {
  if(n*supportCount*supportCount>1_000_000) throw new Error('operation_limit');
}
export function enumerateDesign(input:unknown):AssignmentMass[] {
  const design=parseDesign(input); let joint:AssignmentMass[]=[{labels:[],weight:rational(1n)}];
  for(const s of design.strata) for(const block of s.blocks) {
    const r=block.observationMask.filter(Boolean).length;
    let prefixes:AssignmentMass[]=[{labels:[],weight:rational(1n)}];
    for(let i=0;i<r;i++) prefixes=prefixes.flatMap(row=> {
      const usedA=row.labels.filter(x=>x==='A').length;
      return (['A','B'] as const).flatMap(label=> {
        const remaining=design.blockSize/2-(label==='A'?usedA:i-usedA);
        return remaining===0?[]:[{labels:[...row.labels,label],weight:multiply(row.weight,rational(BigInt(remaining),BigInt(design.blockSize-i)))}];
      });
    });
    joint=joint.flatMap(left=>prefixes.map(right=>({labels:[...left.labels,...right.labels],weight:multiply(left.weight,right.weight)})));
  }
  assertOperationLimit(observedIds(design).length,joint.length);
  return joint;
}
