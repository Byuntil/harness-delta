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
