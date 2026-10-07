import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { comparisonProtocol, protocolRow } from './comparison.js';
import { parseTaskMetadata } from './flexible-contracts.js';
import { Lifecycle } from './lifecycle.js';
import type { Store } from './store.js';
import type { VerifiedSessionIdentity, BindingUsageRecord } from './session-binding-contract.js';
import type { OwnedCliInvocation } from './owned-cli-invocation.js';

/** Opaque, process-local native qualification capability. No browser/profile flag. */
export interface BindingQualificationLease { readonly qualificationOnly: true }
interface State { store: Store; taskId: string; root: string; owner: OwnedCliInvocation; deadline: number; issuedAt: number; generation: number; taskState: string;
 rootId: string|null; childIds: Set<string>; arm: string; pricePin: string; revoked: boolean; requests: Map<string,BindingUsageRecord>; baseline: Set<string> }
const leases=new WeakMap<BindingQualificationLease,State>();
/** Internal executor seam: only an isolated, consumed qualification intent may issue.
 * Native and synthetic control attempts use different fresh stores and reserved intents.
 */
export function issueCodexBindingLease(store: Store, taskId: string, owner: OwnedCliInvocation, deadline: number): BindingQualificationLease {
 const task=new Lifecycle(store).task(taskId);
 const reservation=store.get<{task_id:string;deadline:number;reserved:number}>('SELECT task_id,deadline,reserved FROM binding_qualification WHERE singleton=1');
 const assignment=store.get<{variant_id:string;protocol_id:string}>('SELECT variant_id,protocol_id FROM comparison_assignments WHERE task_id=?',[taskId]);
 const root=store.get<{local_root:string}>('SELECT local_root FROM projects WHERE id=?',[task.project_id])?.local_root;
 if(!reservation||reservation.task_id!==taskId||reservation.reserved!==1||reservation.deadline!==deadline||!root||!assignment||
  parseTaskMetadata(JSON.parse(task.metadata) as unknown).product!=='codex'||comparisonProtocol(store,protocolRow(store,assignment.protocol_id)).purpose!=='functional_pilot'||
  store.all('SELECT id FROM tasks').length!==1||store.all('SELECT id FROM projects').length!==1||store.all('SELECT id FROM sessions').length||store.eventCount())throw new Error('binding_qualification_scope_invalid');
 const protocol=comparisonProtocol(store,protocolRow(store,assignment.protocol_id));
 if(protocol.schema_version!==2)throw new Error('binding_qualification_scope_invalid');
 const lease=Object.freeze({qualificationOnly:true as const});
 leases.set(lease,{store,taskId,root:realpathSync(root),owner,deadline,issuedAt:Date.now(),generation:task.generation,taskState:task.state,rootId:null,childIds:new Set(),arm:assignment.variant_id,pricePin:protocol.price_table_id,revoked:false,requests:new Map(),baseline:new Set()});
 return lease;
}
export function revokeBindingQualification(lease: BindingQualificationLease): void {const state=leases.get(lease);if(state){state.revoked=true;state.owner.stop();}}
export function assertBindingQualification(lease: BindingQualificationLease|undefined, store: Store, taskId: string): boolean {
 if(!lease)return false;const s=leases.get(lease);
 if(!s||s.store!==store||s.taskId!==taskId||s.revoked||!s.owner.hasSpawned()||s.owner.stopRequested()||Date.now()>=s.deadline)throw new Error('binding_qualification_revoked');
 const task=new Lifecycle(store).task(taskId);const assignment=store.get<{variant_id:string;protocol_id:string}>('SELECT variant_id,protocol_id FROM comparison_assignments WHERE task_id=?',[taskId]);
 const root=store.get<{local_root:string}>('SELECT local_root FROM projects WHERE id=?',[task.project_id])?.local_root;
 if(!assignment||assignment.variant_id!==s.arm||root!==s.root||realpathSync(root)!==s.root||
  !['registered','active','paused'].includes(task.state)||task.generation!==s.generation||task.state!==s.taskState||
  parseTaskMetadata(JSON.parse(task.metadata) as unknown).product!=='codex'||store.all('SELECT id FROM tasks').length!==1||store.all('SELECT id FROM projects').length!==1||
  store.get("SELECT 1 FROM tombstones WHERE (kind='task' AND id=?) OR (kind='project' AND id=?)",[taskId,task.project_id]))throw new Error('binding_qualification_revoked');
 const protocol=comparisonProtocol(store,protocolRow(store,assignment.protocol_id));
 if(protocol.schema_version!==2||protocol.price_table_id!==s.pricePin||protocol.purpose!=='functional_pilot')throw new Error('binding_qualification_revoked');
 return true;
}
/** Called synchronously after a lifecycle transition, before another body read.
 * Generation/pins and the independent owner deadline never reset on resume. */
export function noteBindingQualificationTransition(lease:BindingQualificationLease|undefined,store:Store,taskId:string):void {
 if(!lease)return;const s=leases.get(lease);const task=new Lifecycle(store).task(taskId);
 if(s && (s.revoked || !s.owner.isAlive() || s.owner.stopRequested())) return;
 if(!s||s.store!==store||s.taskId!==taskId||Date.now()>=s.deadline||task.generation!==s.generation+1||
   !(s.taskState==='registered'&&task.state==='active'||s.taskState==='active'&&task.state==='paused'||s.taskState==='paused'&&task.state==='active'))throw new Error('binding_qualification_revoked');
 s.generation=task.generation;s.taskState=task.state;assertBindingQualification(lease,store,taskId);
}
export function bindingQualificationOwnerLive(lease:BindingQualificationLease|undefined):boolean {
 const s=lease?leases.get(lease):undefined;return !!s?.owner.isAlive();
}
export function checkBindingQualificationIdentity(lease:BindingQualificationLease|undefined,store:Store,taskId:string,value:VerifiedSessionIdentity):void {
 if(!lease)return;assertBindingQualification(lease,store,taskId);const s=leases.get(lease)!;
 if(value.product!=='codex'||value.productVersion!=='0.160.0'||value.cwd!==s.root||Date.parse(value.createdAt)<s.issuedAt-5000||
  statSync(value.sourceRef).birthtimeMs<s.issuedAt-5000)throw new Error('binding_qualification_identity_invalid');
 if(value.parentSessionId===null){if(s.rootId!==null&&s.rootId!==value.sessionId)throw new Error('binding_qualification_family_limit');s.rootId=value.sessionId;}
 else{if(value.parentSessionId!==s.rootId||!s.childIds.has(value.sessionId)&&s.childIds.size>=2)throw new Error('binding_qualification_family_limit');s.childIds.add(value.sessionId);}
}
export function qualificationRequestKey(record:BindingUsageRecord):string {return createHash('sha256').update(JSON.stringify(['binding-request-v1','codex',record.requestId])).digest('hex');}
export function qualificationRecordedRequests(lease:BindingQualificationLease):ReadonlyMap<string,BindingUsageRecord>{return new Map(leases.get(lease)?.requests);}
export function qualificationBaselineKeys(lease:BindingQualificationLease):ReadonlySet<string>{return new Set(leases.get(lease)?.baseline);}
export function checkBindingQualificationRecord(lease:BindingQualificationLease|undefined,store:Store,taskId:string,value:BindingUsageRecord,baseline=false):void {
 if(!lease)return;assertBindingQualification(lease,store,taskId);const s=leases.get(lease)!;
 if(value.payload.model!=='gpt-6.1-sol'||value.effort!=='high'||value.payload.input_total.status!=='observed'||value.payload.output_total.status!=='observed')throw new Error('binding_qualification_runtime_invalid');
 const key=qualificationRequestKey(value);const old=s.requests.get(key);
 if(old){if(JSON.stringify(old)!==JSON.stringify(value))throw new Error('binding_qualification_request_conflict');return;}
 if(value.sessionId!==s.rootId&&!s.childIds.has(value.sessionId))throw new Error('binding_qualification_identity_invalid');
 const requests=[...s.requests.values()];const own=requests.filter(r=>r.sessionId===value.sessionId).length;
 if(requests.length>=6||own>=(value.sessionId===s.rootId?4:1))throw new Error('binding_qualification_request_limit');
 const tokens=[...requests,value].reduce((n,r)=>n+(r.payload.input_total.value??0)+(r.payload.output_total.value??0),0);
 if(tokens>100000)throw new Error('binding_qualification_token_limit');
 s.requests.set(key,value);if(baseline)s.baseline.add(key);
}
export function qualificationStopReached(lease:BindingQualificationLease):boolean{
 const s=leases.get(lease);if(!s)return true;const records=[...s.requests.values()];
 return records.length>=6||records.filter(r=>r.sessionId===s.rootId).length>=4||records.reduce((n,r)=>n+(r.payload.input_total.value??0)+(r.payload.output_total.value??0),0)>=100000;
}
