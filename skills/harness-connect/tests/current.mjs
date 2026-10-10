import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from '../scripts/connect.mjs';
const receipt = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const origin = 'http://127.0.0.1:4318';
const task = { id: 'task-a', project_id: 'project-a', setup_id: 'setup-a', state: 'registered', version: '"' + 'a'.repeat(64) + '"',
 preparation: { assigned_variant_id: 'arm-b' }, actions: [{code:'session-connect',enabled:true}], binding:{support:'synthetic_validation_only',state:'observing',sessions:[{session_id:session,identity_basis:'native_metadata_receipt'}]} };
const bootstrap = {csrf:'b'.repeat(64),data:{projects:[{id:'project-a'}],tasks:[task],setups:[{id:'setup-a'}]}};
function transport(reply) { const calls=[]; return {calls,fetch:async(url,options)=> {calls.push({url,options});return new Response(JSON.stringify(url.endsWith('/bootstrap')?bootstrap:url.endsWith('/session-connect')?reply:task));}}; }
const diagnosticCodes = [
 'application_source_unqualified', 'application_setup_session_excluded', 'application_output_changed',
 'application_required', 'application_input_changed', 'application_checks_incomplete',
 'application_surface_unowned', 'application_identity_unavailable', 'application_fresh_session_required',
 'application_native_loading_unqualified', 'application_epoch_changed', 'application_workspace_changed',
 'application_cleanup_pending', 'application_managed_retired', 'application_attempt_stale',
 'application_product_mismatch', 'application_checkpoint_invalid', 'application_report_conflict',
 'application_launch_unavailable', 'application_restart_interrupted', 'application_abandoned',
 'application_execution_approval_required', 'application_execution_changed', 'application_preparation_failed',
 'application_permission_stale', 'application_permission_decision_invalid', 'application_permission_outside_ceiling',
 'application_permission_accept_unqualified', 'application_permission_transport_failed', 'application_termination_unverified',
 'application_integrity_unverified', 'application_recovery_required', 'application_publication_unqualified',
 'application_confinement_unverified', 'application_review_changed', 'application_preimage_changed',
 'application_planning_failed', 'application_workspace_mismatch', 'application_path_forbidden',
 'application_preview_changed', 'application_scope_invalid', 'application_job_active', 'application_review_required',
 'binding_pilot_scope_invalid', 'binding_pilot_family_scope', 'binding_pilot_control_only', 'binding_family_limit',
 'external_preparation_required', 'external_window_closed',
];
for (const code of diagnosticCodes) {
 test(`preserves fixed diagnostic ${code} from disabled action without posting`, async () => {
  const blocked = {...task, actions:[{code:'session-connect',enabled:false,reason:code}]};
  const calls=[];
  const fetch=async(url,options)=>{calls.push(options.method);return new Response(JSON.stringify(url.endsWith('/bootstrap')?bootstrap:blocked));};
  await assert.rejects(run('connect',{origin,product:'codex',project:'project-a',task:'task-a',receipt},fetch), {message:code});
  assert.deepEqual(calls,['GET','GET']);
 });
 test(`preserves fixed diagnostic ${code} from rejected server connection`, async () => {
  const calls=[];
  const fetch=async(url,options)=>{calls.push(options.method);return new Response(JSON.stringify(url.endsWith('/bootstrap')?bootstrap:url.endsWith('/session-connect')?{error:code}:task),{status:url.endsWith('/session-connect')?409:200});};
  await assert.rejects(run('connect',{origin,product:'codex',project:'project-a',task:'task-a',receipt},fetch), {message:code});
  assert.deepEqual(calls,['GET','GET','POST']);
 });
}
test('unknown diagnostics remain sanitized at action and server boundaries', async () => {
 for (const boundary of ['action','server']) {
  const calls=[];
  const fetch=async(url,options)=>{
   calls.push(options.method);
   return new Response(JSON.stringify(url.endsWith('/bootstrap')?bootstrap:url.endsWith('/session-connect')?{error:'application_PRIVATE_CONTENT'}:
    boundary==='action'?{...task,actions:[{code:'session-connect',enabled:false,reason:'application_PRIVATE_CONTENT'}]}:task),{status:url.endsWith('/session-connect')?409:200});
  };
  await assert.rejects(run('connect',{origin,product:'codex',project:'project-a',task:'task-a',receipt},fetch),
   {message:boundary==='action'?'binding_provider_unavailable':'local_ui_request_failed'});
  assert.deepEqual(calls,boundary==='action'?['GET','GET']:['GET','GET','POST']);
 }
});
test('opaque native receipt uses shared server binding and starts observation without picker or ticket', async()=>{
 const f=transport({...task,connection:{status:'connected',project_id:'project-a',task_id:'task-a',session_id:session,assigned_variant_id:'arm-b',identity_basis:'native_metadata_receipt',evidence:'server_verified_identity_source_and_relations',collection_active:true,cost_coverage:'partial',automatic_children:true}});
 const result=await run('connect',{origin,product:'codex',project:'project-a',task:'task-a',receipt},f.fetch);
 assert.equal(result.status,'connected');assert.equal(result.collection_active,true);assert.equal(result.automatic_children,true);
 assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);const post=f.calls.find(c=>c.options.method==='POST');assert.ok(post.url.endsWith('/session-connect'));
 assert.deepEqual(JSON.parse(post.options.body),{product:'codex',receipt});
});
test('client fails closed on changed assignment and never accepts a session UUID as native proof',async()=>{
 const f=transport({...task,connection:{status:'connected',project_id:'project-a',task_id:'task-a',session_id:session,assigned_variant_id:'arm-a',identity_basis:'native_metadata_receipt',collection_active:true}});
 await assert.rejects(run('connect',{origin,product:'codex',project:'project-a',task:'task-a',receipt},f.fetch),/connection_unverified/);
});
test('Claude member receipt re-call accepts composite identity only after durable proof re-read',async()=>{
 const member=session+':agent-x'; const memberTask={...task,binding:{...task.binding,sessions:[{session_id:member,identity_basis:'native_metadata_receipt'}]}};
 const calls=[]; const fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.endsWith('/bootstrap')?{...bootstrap,data:{...bootstrap.data,tasks:[memberTask]}}:url.endsWith('/session-connect')?{connection:{status:'already_connected',role:'child',project_id:'project-a',task_id:'task-a',session_id:member,assigned_variant_id:'arm-b',identity_basis:'native_metadata_receipt',evidence:'server_verified_identity_source_and_relations',collection_active:true,cost_coverage:'partial',automatic_children:true}}:memberTask));};
 const result=await run('connect',{origin,product:'claude_code',project:'project-a',task:'task-a',receipt,role:'child'},fetch);
 assert.equal(result.session_id,member);assert.equal(result.status,'already_connected');
 assert.deepEqual(JSON.parse(calls.find(c=>c.options.method==='POST').options.body),{product:'claude_code',receipt});
});
test('Claude same-command lookup uses a fresh hook receipt and never a session hint alone',async(t)=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {projectHookInput,writeReceipt}=await import('../scripts/claude-session-hook.mjs');
 const dir=mkdtempSync(join(tmpdir(),'harness-connect-hook-fixture-'));
 const priorDir=process.env.HARNESS_DELTA_CLAUDE_RECEIPT_DIR;const priorId=process.env.CLAUDE_CODE_SESSION_ID;
 t.after(()=>{if(priorDir===undefined)delete process.env.HARNESS_DELTA_CLAUDE_RECEIPT_DIR;else process.env.HARNESS_DELTA_CLAUDE_RECEIPT_DIR=priorDir;if(priorId===undefined)delete process.env.CLAUDE_CODE_SESSION_ID;else process.env.CLAUDE_CODE_SESSION_ID=priorId;rmSync(dir,{recursive:true,force:true});});
 process.env.HARNESS_DELTA_CLAUDE_RECEIPT_DIR=dir;process.env.CLAUDE_CODE_SESSION_ID=session;
 const f=transport({connection:{status:'connected',project_id:'project-a',task_id:'task-a',session_id:session,assigned_variant_id:'arm-b',identity_basis:'native_metadata_receipt',evidence:'server_verified_identity_source_and_relations',collection_active:true,cost_coverage:'partial',automatic_children:true}});
 await assert.rejects(run('connect',{origin,product:'claude_code',project:'project-a',task:'task-a'},f.fetch),/hook_receipt_missing/);
 const projected=projectHookInput({hook_event_name:'PreToolUse',session_id:session,transcript_path:join(dir,session+'.jsonl'),cwd:dir,tool_name:'Bash',tool_use_id:'fixture-tool',tool_input:{command:'node .claude/skills/harness-connect/scripts/connect.mjs connect --product claude_code --project project-a --task task-a PRIVATE_CONTENT'}},{CLAUDE_PID:String(process.pid)});
 assert.ok(projected);assert.equal(JSON.stringify(projected).includes('PRIVATE_CONTENT'),false);writeReceipt(dir,projected);
 const result=await run('connect',{origin,product:'claude_code',project:'project-a',task:'task-a'},f.fetch);assert.equal(result.collection_active,true);
 assert.equal(JSON.parse(f.calls.find(c=>c.options.method==='POST').options.body).receipt,projected.receipt_id);
});
