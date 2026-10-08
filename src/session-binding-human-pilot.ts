import { Lifecycle } from './lifecycle.js';
import { comparisonProtocol, protocolRow } from './comparison.js';
import { parseTaskMetadata } from './flexible-contracts.js';
import { CodexSessionBindingProvider } from './session-binding-codex.js';
import { bindingIdentityKey, VerifiedSessionIdentitySchema, type SessionBindingProvider, type VerifiedSessionIdentity } from './session-binding-contract.js';
import type { Store } from './store.js';
import type { FlexibleProtocol } from './flexible-contracts.js';
import { lstatSync } from 'node:fs';
import { bindingCollectionControl, registerBindingCollectionControl } from './external-session-contract.js';

/** Candidate evidence only; this identifier is not a production admission. */
export const codexHumanPilotProfileId = 'codex-01600-ordinary-human-pilot';
export interface CodexHumanPilotScope { readonly taskId: string; }
interface Scope { store: Store; taskId: string; provider: CodexSessionBindingProvider; metadata: string; protocol: string; projectRoot: string; collection: string; openedAt: string; }
const scopes = new WeakMap<CodexHumanPilotScope, Scope>();
export function isCodexHumanPilotProtocol(protocol: FlexibleProtocol): boolean {
 return protocol.purpose==='functional_pilot'&&protocol.source_profiles.length===1&&protocol.source_profiles.every(p=>p.product==='codex'&&p.product_version==='0.160.0'&&p.profile_id===codexHumanPilotProfileId);
}
function context(store: Store, taskId: string) {
 const task=new Lifecycle(store).task(taskId);
 const metadata=parseTaskMetadata(JSON.parse(task.metadata) as unknown);
 const assignment=store.get<{protocol_id:string}>('SELECT protocol_id FROM comparison_assignments WHERE task_id=?',[taskId]);
 if(!assignment)throw new Error('binding_pilot_scope_invalid');
 const row=protocolRow(store,assignment.protocol_id);const protocol=comparisonProtocol(store,row);
 const root=store.get<{local_root:string}>('SELECT local_root FROM projects WHERE id=?',[task.project_id]);
 if(metadata.product!=='codex'||protocol.schema_version!==2||!isCodexHumanPilotProtocol(protocol)||protocol.project_id!==task.project_id||!root)throw new Error('binding_pilot_scope_invalid');
 return {metadata:task.metadata,protocol:JSON.stringify(protocol),projectRoot:root.local_root,collection:JSON.stringify(bindingCollectionControl(store,taskId)??null)};
}
/** Called only by the local operator's explicit pilot observation command.
 * No native source access, process ownership, intent or billed-request budget. */
export function issueCodexHumanPilotScope(store: Store, taskId: string, provider: CodexSessionBindingProvider, options: {untilExplicitStop?:boolean} = {}): CodexHumanPilotScope {
 if(!(provider instanceof CodexSessionBindingProvider)||provider.capabilities().maxDepth!==1)throw new Error('binding_pilot_scope_invalid');
 provider.assertProjectRoot(context(store,taskId).projectRoot);
 if(options.untilExplicitStop)registerBindingCollectionControl(store,taskId);
 const current=context(store,taskId);
 const scope=Object.freeze({taskId});scopes.set(scope,{store,taskId,provider,...current,openedAt:new Date().toISOString()});return scope;
}
export function assertCodexHumanPilotScope(scope: CodexHumanPilotScope, store: Store, taskId: string, provider?: SessionBindingProvider): void {
 const value=scopes.get(scope);
 if(!value||value.store!==store||value.taskId!==taskId||provider&&provider!==value.provider)throw new Error('binding_pilot_scope_invalid');
 const current=context(store,taskId);
 if(current.metadata!==value.metadata||current.protocol!==value.protocol||current.projectRoot!==value.projectRoot||current.collection!==value.collection)throw new Error('binding_pilot_scope_invalid');
}
/** Metadata identity checks precede every usage-body read and every bind write.
 * Existing full identities permit same-family resume after UI restart. */
export function checkCodexHumanPilotIdentity(scope: CodexHumanPilotScope, store: Store, taskId: string, identity: VerifiedSessionIdentity): void {
 assertCodexHumanPilotScope(scope,store,taskId);
 const value=scopes.get(scope)!;
 const members=store.all<{identity:string}>('SELECT identity FROM session_bindings WHERE task_id=?',[taskId]).map(r=>VerifiedSessionIdentitySchema.parse(JSON.parse(r.identity) as unknown));
 const root=members.find(m=>m.parentSessionId===null);const existing=members.find(m=>m.sessionId===identity.sessionId);
 if(identity.product!=='codex'||identity.productVersion!=='0.160.0'||identity.cwd!==value.projectRoot||
  existing&&bindingIdentityKey(existing)!==bindingIdentityKey(identity)||
  identity.parentSessionId===null&&(root?root.sessionId!==identity.sessionId:Date.parse(identity.createdAt)<Date.parse(value.openedAt))||
  identity.parentSessionId!==null&&(!root||identity.parentSessionId!==root.sessionId||Date.parse(identity.createdAt)<Date.parse(root.createdAt))||
  !existing&&members.length>=3)throw new Error('binding_pilot_family_scope');
 if(identity.parentSessionId===null&&!root) {
  // A newly emitted hook receipt alone cannot make an old resumed file fresh.
  let bornAt:number;
  try{const stat=lstatSync(identity.sourceRef);if(!stat.isFile()||stat.isSymbolicLink())throw new Error();bornAt=stat.birthtimeMs;}catch{throw new Error('binding_pilot_family_scope');}
  if(!Number.isFinite(bornAt)||bornAt<Date.parse(value.openedAt))throw new Error('binding_pilot_family_scope');
 }
}


export { claudeHumanPilotProfileId, assertClaudeHumanPilotSource } from './session-binding-claude-human-pilot.js';
import { isClaudeHumanPilotProtocol, isClaudeHumanPilotScope, assertClaudeHumanPilotScope, checkClaudeHumanPilotIdentity, type ClaudeHumanPilotScope } from './session-binding-claude-human-pilot.js';
export type HumanPilotScope = CodexHumanPilotScope | ClaudeHumanPilotScope;
export const isHumanPilotProtocol = (protocol: FlexibleProtocol) => isCodexHumanPilotProtocol(protocol) || isClaudeHumanPilotProtocol(protocol);
export const assertHumanPilotScope = (scope: HumanPilotScope, store: Store, taskId: string, provider?: SessionBindingProvider) => isClaudeHumanPilotScope(scope) ? assertClaudeHumanPilotScope(scope, store, taskId, provider) : assertCodexHumanPilotScope(scope, store, taskId, provider);
export const checkHumanPilotIdentity = (scope: HumanPilotScope, store: Store, taskId: string, identity: VerifiedSessionIdentity) => isClaudeHumanPilotScope(scope) ? checkClaudeHumanPilotIdentity(scope, store, taskId, identity) : checkCodexHumanPilotIdentity(scope, store, taskId, identity);
