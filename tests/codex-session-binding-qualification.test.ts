import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { OwnedCliInvocation } from '../src/owned-cli-invocation.js';
import { prepareCodexSessionBindingQualification, executeCodexSessionBindingQualification, codexBindingQualificationArgv, serveCodexSessionBindingQualificationUiPreparation, serveCodexSessionBindingQualificationResults } from '../src/codex-session-binding-qualification.js';
import { createLocalWebDomain } from '../src/local-web-domain.js';
import { assertBindingQualification, issueCodexBindingLease, noteQualificationCollectorError, qualificationCollectorError } from '../src/session-binding-qualification-lease.js';
import { Store } from '../src/store.js';
import * as priceSelection from '../src/price-catalog-selection.js';
import * as localWeb from '../src/local-web-domain.js';
import { createSessionBindingService } from '../src/session-binding-service.js';
import { CodexSessionBindingProvider } from '../src/session-binding-codex.js';

const digest=(s:Buffer|string)=>createHash('sha256').update(s).digest('hex');
function fixture(mode='normal'){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ordinary-binding-qualification-')));const home=join(root,'home');mkdirSync(home);mkdirSync(join(home,'sessions'));

 const uiAction=`const b=await(await fetch(origin+'/api/bootstrap')).json();const action=async code=>{const current=await(await fetch(origin+'/api/tasks/'+i.task_id)).json();const response=await fetch(origin+'/api/tasks/'+i.task_id+'/'+code,{method:'POST',headers:{origin,'content-type':'application/json','x-harness-csrf':b.csrf,'idempotency-key':randomUUID(),'if-match':current.version},body:'{}'});if(!response.ok)throw Error(code+response.status);return await response.json();};`;
 const followUp:Record<string,string>={
  'root-stop':"for(let n=0;n<2;n++)appendFileSync(file(root),usage(root,'extra-'+n));await new Promise(r=>setTimeout(r,1200));",
  'token-stop':"appendFileSync(file(root),usage(root,'token-boundary','gpt-6.1-sol',99958));await new Promise(r=>setTimeout(r,1200));",
  'child-overflow':"appendFileSync(file(children[0]),usage(children[0],'extra-child'));await new Promise(r=>setTimeout(r,1200));",
  'late-request':"writeFileSync(join(i.directory,'late-record.json'),JSON.stringify({file:file(root),bytes:usage(root,'late-turn')}));",
  'late-runtime':"writeFileSync(join(i.directory,'late-record.json'),JSON.stringify({file:file(root),bytes:usage(root,'late-turn','wrong-model')}));",
  'late-tokens':"writeFileSync(join(i.directory,'late-record.json'),JSON.stringify({file:file(root),bytes:usage(root,'late-turn','gpt-6.1-sol',100000)}));",
  'late-gap':"writeFileSync(join(i.directory,'late-record.json'),JSON.stringify({file:file(root),bytes:row('compacted',{})}));",
  'pause-exit':uiAction+"await action('pause');await new Promise(r=>setTimeout(r,1000));",
  emergency:uiAction+"await action('emergency-stop');await new Promise(r=>setTimeout(r,1000));",
  'pause-resume':uiAction+`for(let cycle=0;cycle<2;cycle++){await action('pause');appendFileSync(file(root),usage(root,'paused-'+cycle));const before=await(await fetch(origin+'/api/tasks/'+i.task_id)).json();if(before.measurement.state!=='paused'||before.binding.requests!==3||before.actions.some(a=>['apply','ticket','connect','rework','release'].includes(a.code)&&a.enabled)||before.actions.some(a=>a.code.startsWith('finish-')&&a.enabled))throw Error('paused contract');await action('resume-binding');}await new Promise(r=>setTimeout(r,350));`,
  continued:uiAction+`await action('pause');const pending=usage(root,'continued-turn').split('\\n');appendFileSync(file(root),pending[0]+'\\n');await action('resume-binding');appendFileSync(file(root),pending[1]+'\\n');await new Promise(r=>setTimeout(r,350));`,
 };
 const script=join(root,'native-fixture.mjs');
 writeFileSync(script,`import{readFileSync,writeFileSync,appendFileSync}from'node:fs';import{join}from'node:path';import{randomUUID}from'node:crypto';import{execFileSync}from'node:child_process';
 const i=JSON.parse(readFileSync(process.env.HARNESS_BINDING_TEST_INTENT,'utf8'));const origin='http://127.0.0.1:'+i.port;const root=randomUUID();const children=[randomUUID(),randomUUID()];const at=()=>new Date().toISOString();const row=(type,payload)=>JSON.stringify({timestamp:at(),type,payload})+'\\n';
 ${mode==='deadline-before-connect'?"setInterval(()=>{},1000);await new Promise(()=>{});":''}
 const file=id=>join(i.codex_home,'sessions',id+'.jsonl');const meta=(id,parent)=>row('session_meta',{id,session_id:root,cwd:i.project,cli_version:'0.160.0',parent_thread_id:parent,source:parent?{subagent:{thread_spawn:{parent_thread_id:parent,depth:1}}}:'cli'});
 writeFileSync(file(root),meta(root,null));const record=(id,parent)=>{const output=execFileSync(i.wrapper,[],{input:JSON.stringify({hook_event_name:parent?'SubagentStart':'SessionStart',session_id:root,agent_id:parent?id:undefined,turn_id:parent?'child-turn':undefined,source:parent?undefined:'startup',cwd:i.project,transcript_path:file(id)}),encoding:'utf8'});return /[a-f0-9-]{36}/.exec(JSON.parse(output).hookSpecificOutput.additionalContext)[0];};
 const usage=(id,turn,model='gpt-6.1-sol',input=10)=>row('turn_context',{cwd:i.project,turn_id:turn,root_turn_id:id===root?turn:'root-turn',model,effort:'high'})+row('token_usage_record',{thread_id:id,session_id:root,turn_id:turn,root_turn_id:id===root?turn:'root-turn',response_id:randomUUID(),usage:{input_tokens:input,cached_input_tokens:2,output_tokens:3,reasoning_output_tokens:1,total_tokens:input+3}});
 ${mode==='baseline'||mode==='root-stop'?"appendFileSync(file(root),usage(root,'baseline-turn'));":''}
 const receipt=record(root,null);const helper=join(i.project,'.agents/skills/harness-connect/scripts/connect.mjs');execFileSync(i.node,[helper,'connect','--origin',origin,'--product','codex','--project',i.project_id,'--task',i.task_id,'--receipt',receipt],{stdio:'ignore'});
 await new Promise(r=>setTimeout(r,30));for(const child of children){writeFileSync(file(child),meta(child,root));record(child,root);}
 for(const id of[root,...children]){appendFileSync(file(id),row('turn_context',{cwd:i.project,turn_id:id===root?'root-turn':'child-turn',root_turn_id:'root-turn',model:'gpt-6.1-sol',effort:'high'})+row('token_usage_record',{thread_id:id,session_id:root,turn_id:id===root?'root-turn':'child-turn',root_turn_id:'root-turn',response_id:randomUUID(),usage:{input_tokens:10,cached_input_tokens:2,output_tokens:3,reasoning_output_tokens:1,total_tokens:13}}));}
 for(let n=0;n<150;n++){const t=await(await fetch(origin+'/api/tasks/'+i.task_id)).json();if(t.binding?.requests===3&&t.binding.children===2){${followUp[mode]??''}process.exit(0);}await new Promise(r=>setTimeout(r,20));}process.exit(4);
 `);
 let finalInjectionObserved=false;
 const beforeFinalSourceCheck=mode.startsWith('late-')?(native:{status:string;terminationVerified:boolean})=>{
  expect(native).toMatchObject({status:'completed',terminationVerified:true});
  const late=JSON.parse(readFileSync(join(root,'attempt','late-record.json'),'utf8')) as {file:string;bytes:string};
  appendFileSync(late.file,late.bytes);finalInjectionObserved=true;
 }:undefined;
 return{root,home,script,dir:join(root,'attempt'),dependency:{script,durationMs:mode==='deadline-before-connect'?500:5000,...(beforeFinalSourceCheck?{beforeFinalSourceCheck}:{})},finalInjectionObserved:()=>finalInjectionObserved,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
const consent=(sha:string)=>({intent_sha256:sha,approval_reference:'synthetic-test-only',actual_model_run:true,transient_hooks:true,native_source_reads:true,owned_process_termination:true});
test('manual start is frozen and omits only the automatic initial prompt',async()=>{
 const f=fixture();try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home,startMode:'manual'},f.dependency);
  expect(p.intent).toMatchObject({start_mode:'manual',root_request_stop:4,observed_request_stop:6,duration_ms:5000});
  const automatic=codexBindingQualificationArgv({...p.intent,start_mode:'automatic'});
  const manual=codexBindingQualificationArgv(p.intent);
  expect(automatic.at(-1)).toMatch(/^\$harness-connect /);expect(manual).toEqual(automatic.slice(0,-1));
  expect(manual.join(' ')).toContain('/<session-flags>/config.toml');expect(manual).not.toContain('exec');
  const bytes=readFileSync(p.intentPath,'utf8');expect(JSON.parse(bytes)).toMatchObject({start_mode:'manual'});
  expect(digest(bytes)).toBe(p.sha256);
 }finally{f.cleanup();}
});
test('omitted start mode keeps automatic startup and unknown modes create no preparation',async()=>{
 const f=fixture();const invalid=fixture();try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  expect(p.intent).toMatchObject({start_mode:'automatic'});expect(codexBindingQualificationArgv(p.intent).at(-1)).toMatch(/^\$harness-connect /);
  await expect(prepareCodexSessionBindingQualification(invalid.dir,{binary:realpathSync(process.execPath),codexHome:invalid.home,startMode:'unknown' as 'manual'},invalid.dependency)).rejects.toThrow();
  expect(()=>readFileSync(join(invalid.dir,'execution-intent.json'))).toThrow();
 }finally{f.cleanup();invalid.cleanup();}
});
test('changing the frozen manual mode cannot use its original consent or reserve execution',async()=>{
 const f=fixture();try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home,startMode:'manual'},f.dependency);
  writeFileSync(p.intentPath,JSON.stringify({...p.intent,start_mode:'automatic'}));
  await expect(executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),f.dependency)).rejects.toThrow('binding_qualification_consent_required');
  const store=new Store(p.intent.database);try{expect(store.get<{reserved:number}>('SELECT reserved FROM binding_qualification')?.reserved).toBe(0);}finally{store.close();}
 }finally{f.cleanup();}
});
test('a fresh synthetic legacy intent without start_mode still parses as automatic',async()=>{
 const f=fixture();try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  const {start_mode:mode,...legacy}=p.intent;expect(mode).toBe('automatic');const bytes=JSON.stringify(legacy);
  writeFileSync(p.intentPath,bytes);const store=new Store(p.intent.database);
  try{store.execute('UPDATE binding_qualification SET intent_hash=?',[digest(bytes)]);}finally{store.close();}
  const result=await executeCodexSessionBindingQualification(p.intentPath,consent(digest(bytes)),f.dependency);
  expect(result).toMatchObject({status:'completed',start_mode:'automatic',native:{terminationVerified:true}});
 }finally{f.cleanup();}
},10000);
test('failed binding transaction preserves lease generation and permits another fresh root',async()=>{
 const f=fixture();let store:Store|undefined;
 const spawned=vi.spyOn(OwnedCliInvocation.prototype,'hasSpawned').mockReturnValue(true);
 const alive=vi.spyOn(OwnedCliInvocation.prototype,'isAlive').mockReturnValue(true);
 try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  store=new Store(p.intent.database);const deadline=Date.now()+5000;store.execute('UPDATE binding_qualification SET reserved=1,deadline=?',[deadline]);
  const owner=new OwnedCliInvocation({command:realpathSync(process.execPath),args:[],cwd:f.root,durationMs:100,stdio:'ignore'});
  const lease=issueCodexBindingLease(store,p.intent.task_id,owner,deadline);
  const provider=new CodexSessionBindingProvider({receiptDirectory:p.intent.receipts,sourceRoots:[join(f.home,'sessions')],projectRoot:p.intent.project,maxDepth:1,maxFamilyMembers:3});
  const service=createSessionBindingService({store,providers:[provider],qualificationLease:lease,setupFor:()=>p.intent.profile.setup});
  const fresh=()=>{
   const id=randomUUID();const source=join(f.home,'sessions',id+'.jsonl');
   writeFileSync(source,JSON.stringify({timestamp:new Date().toISOString(),type:'session_meta',payload:{id,session_id:id,cwd:p.intent.project,cli_version:'0.160.0',source:'cli'}})+'\n');
   const output=execFileSync(p.intent.wrapper,[],{input:JSON.stringify({hook_event_name:'SessionStart',session_id:id,source:'startup',cwd:p.intent.project,transcript_path:source}),encoding:'utf8'});
   const receipt=/[a-f0-9-]{36}/.exec((JSON.parse(output) as {hookSpecificOutput:{additionalContext:string}}).hookSpecificOutput.additionalContext)![0];
   return{receipt};
  };
  const first=fresh();const fail=vi.spyOn(priceSelection,'selectTaskPriceTable').mockImplementationOnce(()=>{throw new Error('synthetic_bind_failure');});
  try{await expect(service.connect(p.intent.task_id,'codex',first)).rejects.toThrow('synthetic_bind_failure');}finally{fail.mockRestore();}
  expect(store.get('SELECT state,generation FROM tasks')).toEqual({state:'registered',generation:0});
  expect(store.all('SELECT id FROM sessions')).toEqual([]);
  expect(()=>assertBindingQualification(lease,store!,p.intent.task_id)).not.toThrow();
  expect(await service.connect(p.intent.task_id,'codex',fresh())).toMatchObject({status:'connected',roots:1});
 }finally{store?.close();spawned.mockRestore();alive.mockRestore();f.cleanup();}
});

for(const code of ['clock_regression','private diagnostic /secret'] as const)test(`first task snapshot diagnostic survives termination failure with ${code==='clock_regression'?'a fixed code':'redaction'}`,async()=>{
 const f=fixture();let live=false;
 const factory=localWeb.createLocalWebDomain;
 const domain=vi.spyOn(localWeb,'createLocalWebDomain').mockImplementation(options=>{
  const result=factory(options);if(options.qualificationLease){
   result.task=()=>{throw new Error(code);};
   if(code!=='clock_regression'){
    const close=result.close?.bind(result);result.close=async()=>{await close?.();throw new Error('late cleanup /secret');};
   }
  }return result;
 });
 const spawned=vi.spyOn(OwnedCliInvocation.prototype,'hasSpawned').mockReturnValue(true);
 const alive=vi.spyOn(OwnedCliInvocation.prototype,'isAlive').mockImplementation(()=>live);
 const run=vi.spyOn(OwnedCliInvocation.prototype,'run').mockImplementation(async()=>{
  live=true;await delay(80);live=false;
  return{status:'stopped',pid:42,exitCode:null,terminationVerified:false,ownershipVerified:true,controllingTerminal:true,escapedMemberObserved:false,ownedMembers:1,terminationCause:'control',groupChanges:[],groupChangesTruncated:false};
 });
 try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  const result=await executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),f.dependency);
  expect(result).toMatchObject({reason:'owned_cli_termination_unverified',first_diagnostic:{stage:'task_snapshot',code:code==='clock_regression'?'clock_regression':'unknown_error'},observer_stop_reason:'binding_qualification_observer_failed'});
  expect(JSON.stringify(result)).not.toContain('/secret');
 }finally{domain.mockRestore();spawned.mockRestore();alive.mockRestore();run.mockRestore();f.cleanup();}
});
test('an unlinked owner reaching its fixed deadline reports timeout separately from observer failure',async()=>{
 const f=fixture('deadline-before-connect');try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  const result=await executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),f.dependency);
  expect(result,JSON.stringify(result)).toMatchObject({status:'failed',reason:'binding_qualification_deadline_reached',safety_usage_verification:'unverified',native:{terminationVerified:true},binding:{roots:0,children:0,requests:0},independent_source_check:null});
 }finally{f.cleanup();}
},5000);
test('one ordinary fixture connects through real helper/server, inherits two direct children without child connect, records native product separately, verifies shutdown and independent counters',async()=>{
 const f=fixture();try{
  const prepared=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  const args=codexBindingQualificationArgv(prepared.intent);expect(args[0]).toBe('--cd');expect(args).not.toContain('exec');expect(args.join(' ')).toContain('/<session-flags>/config.toml');
  expect(args.at(-1)).toBe(`$harness-connect Connect once to project qualification-project, task ${prepared.intent.task_id}, at http://127.0.0.1:4319 using the current hook-provided receipt. Then spawn exactly two fresh direct children with gpt-6.1-sol/high and no inherited history. Each child must make no tool calls, return a short acknowledgement in one model request, and finish. Wait once for both children. Do no other work. Keep the root within four model requests and stop.`);
  expect(digest(readFileSync(prepared.intentPath))).toBe(prepared.sha256);
  // A synthetic intent has no public execution switch: native entry rejects it.
  await expect(executeCodexSessionBindingQualification(prepared.intentPath,consent(prepared.sha256))).rejects.toThrow('binding_qualification_invalid_fixture');
  const result=await executeCodexSessionBindingQualification(prepared.intentPath,consent(prepared.sha256),f.dependency);
  expect(result,JSON.stringify(result)).toMatchObject({status:'completed',product_gate_delta:false,native:{terminationVerified:true},binding:{roots:1,children:2,requests:3},independent_source_check:{sources:3,observed_request_matches:3}});
  const store=new Store(prepared.intent.database);try{expect(store.all<{product:string}>('SELECT product FROM sessions').map(r=>r.product)).toEqual(['codex','codex','codex']);expect(store.all<{payload:string}>('SELECT payload FROM runtime_evidence').map(r=>(JSON.parse(r.payload) as {product:string}).product)).toEqual(['codex','codex','codex']);}finally{store.close();}
  const results=await serveCodexSessionBindingQualificationResults(prepared.intentPath,f.dependency);
  try{const bootstrap=(await results.app.inject({url:'/api/bootstrap',headers:{host:'127.0.0.1:4319'}})).json<{csrf:string}>();
   const task=(await results.app.inject({url:'/api/tasks/'+prepared.intent.task_id,headers:{host:'127.0.0.1:4319'}})).json<{version:string;actions:{code:string;enabled:boolean}[]}>();
   expect(task.actions.filter(a=>a.enabled).map(a=>a.code)).toEqual(['finish-success','finish-failed','finish-abandoned']);
   const outcome=await results.app.inject({method:'POST',url:'/api/tasks/'+prepared.intent.task_id+'/finish-success',headers:{host:'127.0.0.1:4319',origin:results.origin,'x-harness-csrf':bootstrap.csrf,'idempotency-key':randomUUID(),'if-match':task.version},payload:{}});
   expect(outcome.statusCode,outcome.body).toBe(200);expect(outcome.json()).toMatchObject({outcome:{status:'success'}});
  }finally{await results.close();}
  await expect(executeCodexSessionBindingQualification(prepared.intentPath,consent(prepared.sha256),f.dependency)).rejects.toThrow();
 }finally{f.cleanup();}
},10000);
test('intent drift or missing exact approval cannot start a reserved execution',async()=>{
 const f=fixture();try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  await expect(executeCodexSessionBindingQualification(p.intentPath,consent('0'.repeat(64)),f.dependency)).rejects.toThrow('binding_qualification_consent_required');
  writeFileSync(p.intent.wrapper,'changed');await expect(executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),f.dependency)).rejects.toThrow('binding_qualification_drift');
 }finally{f.cleanup();}
});

for(const changed of ['recorder','helper'] as const)test(`frozen ${changed} bytes cannot change before reservation or launch`,async()=>{
 const f=fixture();try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  writeFileSync(changed==='recorder'?p.intent.recorder:join(p.intent.project,'.agents/skills/harness-connect/scripts/connect.mjs'),'changed');
  await expect(executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),f.dependency)).rejects.toThrow('binding_qualification_drift');
  const store=new Store(p.intent.database);try{expect(store.get<{reserved:number}>('SELECT reserved FROM binding_qualification')?.reserved).toBe(0);}finally{store.close();}
 }finally{f.cleanup();}
});
for(const [mode,reason] of [['late-request','binding_qualification_final_unobserved_request'],['late-runtime','binding_qualification_runtime_invalid'],['late-tokens','binding_qualification_token_limit'],['late-gap','binding_qualification_final_gap']]as const)test(`final independent projection rejects ${mode} after the last collector tick`,async()=>{
 const f=fixture(mode);try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  const result=await executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),f.dependency);
  expect(f.finalInjectionObserved()).toBe(true);
  expect(result,JSON.stringify(result)).toMatchObject({status:'failed',reason,phase:'source_check',native:{terminationVerified:true}});
 }finally{f.cleanup();}
},10000);
test('pre-connect baseline stays excluded from measured usage while final native request bounds include it',async()=>{
 const f=fixture('baseline');try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  const result=await executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),f.dependency);
  expect(result,JSON.stringify(result)).toMatchObject({status:'completed',binding:{requests:3},independent_source_check:{native_owned_requests:4,observed_request_matches:3,excluded_baseline_requests:1}});
 }finally{f.cleanup();}
},10000);

test('no lease or a browser-shaped forged lease can open native binding admission',async()=>{
 const f=fixture();try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  const store=new Store(p.intent.database);const domain=createLocalWebDomain({store,metadataFile:p.intent.metadata,profiles:[p.intent.profile]});
  try{
   expect(assertBindingQualification(undefined,store,p.intent.task_id)).toBe(false);
   expect(()=>assertBindingQualification({qualificationOnly:true},store,p.intent.task_id)).toThrow('binding_qualification_revoked');
   await expect(domain.taskAction(p.intent.task_id,'session-connect',{product:'codex',receipt:'00000000-0000-4000-8000-000000000000'})).rejects.toThrow('binding_source_unqualified');
  }finally{await domain.close?.();store.close();}
 }finally{f.cleanup();}
});
test('native exit while UI paused reports safety usage unverified without final source reads',async()=>{
 const f=fixture('pause-exit');try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  const result=await executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),f.dependency);
  expect(result,JSON.stringify(result)).toMatchObject({status:'failed',reason:'binding_qualification_safety_usage_unverified',native:{status:'completed',terminationVerified:true},independent_source_check:{safety_usage_verification:'unverified',reason:'task_paused_no_source_read'}});
 }finally{f.cleanup();}
},10000);

test('browser preparation leaves the exact native-intent task unprepared until the UI applies configuration',async()=>{
 const f=fixture();try{
  const dependency={...f.dependency,uiPreparation:true};
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},dependency);
  const store=new Store(p.intent.database);const domain=createLocalWebDomain({store,metadataFile:p.intent.metadata,profiles:[p.intent.profile]});
  try{expect(domain.task(p.intent.task_id).actions).toContainEqual({code:'apply',enabled:true,reason:null});}finally{await domain.close?.();store.close();}
 }finally{f.cleanup();}
});

test('offline preparation UI applies only the exact task and cannot connect, choose a source or reserve native execution',async()=>{
 const f=fixture();const dependency={...f.dependency,uiPreparation:true};
 try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},dependency);
  await expect(executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),dependency)).rejects.toThrow('binding_qualification_ui_preparation_required');
  const server=await serveCodexSessionBindingQualificationUiPreparation(p.intentPath,dependency);
  try{
   const bootstrap=(await server.app.inject({url:'/api/bootstrap',headers:{host:'127.0.0.1:4319'}})).json<{csrf:string}>();
   const task=(await server.app.inject({url:'/api/tasks/'+p.intent.task_id,headers:{host:'127.0.0.1:4319'}})).json<{version:string}>();
   const headers={host:'127.0.0.1:4319',origin:server.origin,'content-type':'application/json','x-harness-csrf':bootstrap.csrf,'idempotency-key':randomUUID(),'if-match':task.version};
   const apply=await server.app.inject({method:'POST',url:'/api/tasks/'+p.intent.task_id+'/apply',headers,payload:'{}'});
   expect(apply.statusCode,apply.body).toBe(200);expect(apply.json()).toMatchObject({preparation:{configuration_evidence:'verified_at_preparation'}});
   const denied=await server.app.inject({method:'POST',url:'/api/tasks/'+p.intent.task_id+'/session-picker',headers:{...headers,'idempotency-key':randomUUID(),'if-match':apply.json<{version:string}>().version},payload:'{}'});
   expect(denied.statusCode).toBe(400);
  }finally{await server.close();}
  const store=new Store(p.intent.database);try{expect(store.get<{reserved:number}>('SELECT reserved FROM binding_qualification')?.reserved).toBe(0);expect(store.all('SELECT id FROM sessions')).toHaveLength(0);}finally{store.close();}
 }finally{f.cleanup();}
},10000);

for (const mode of ['pause-resume','emergency'] as const) test(`qualification ${mode} preserves measurement fences and independent owner control`,async()=>{
 const f=fixture(mode);try{const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
 const result=await executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),f.dependency);
 expect(result,JSON.stringify(result)).toMatchObject(mode==='pause-resume'?{status:'completed',binding:{requests:3,gaps:['unobserved_interval']},native:{status:'completed',terminationVerified:true},independent_source_check:{native_owned_requests:5,excluded_baseline_requests:2,observed_request_matches:3}}:{status:'failed',native:{status:'stopped',terminationVerified:true}});
 }finally{f.cleanup();}
},10000);

test('request continuing a pre-resume context stays excluded from measurement but safety ledger reconciles it',async()=>{
 const f=fixture('continued');try{const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
 const result=await executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),f.dependency);
 expect(result,JSON.stringify(result)).toMatchObject({status:'completed',binding:{requests:3,gaps:['unobserved_interval','binding_unobserved_context']},independent_source_check:{native_owned_requests:4,excluded_baseline_requests:1,observed_request_matches:3}});
 }finally{f.cleanup();}
},10000);

for(const mode of ['root-stop','child-overflow','token-stop'] as const)test(`active ${mode} stops the live owner at changed own-request bounds`,async()=>{
 const f=fixture(mode);try{const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);const result=await executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),f.dependency);
 expect(result,JSON.stringify(result)).toMatchObject({status:'failed',native:{status:'stopped',terminationVerified:true}});
 expect(result.binding).toMatchObject({requests:mode==='root-stop'?5:mode==='token-stop'?4:3});
 const expected=mode==='root-stop'?{predicate:'safety_limit',safety:{reached:['root_request_limit','total_request_limit'],root_requests:4,total_requests:6,excluded_baseline_requests:1,input_output_tokens:78},attempted:null}:mode==='child-overflow'?{predicate:'collector_limit',safety:{root_requests:1,total_requests:3,input_output_tokens:39},attempted:{own_requests:2,total_requests:4,input_output_tokens:52,excluded_baseline:false}}:{predicate:'safety_limit',safety:{reached:['token_limit'],root_requests:2,total_requests:4,input_output_tokens:100000},attempted:null};
 expect(result,JSON.stringify(result)).toMatchObject({stop_witness:expected});
 }finally{f.cleanup();}
},10000);

test('first fixed collector error and observer stop reason survive a later termination failure',async()=>{
 const f=fixture('child-overflow');
 // eslint-disable-next-line @typescript-eslint/unbound-method -- The original is invoked only with the owning instance through call.
 const run=OwnedCliInvocation.prototype.run;const spy=vi.spyOn(OwnedCliInvocation.prototype,'run');
 spy.mockImplementation(async function(this:OwnedCliInvocation,signal){const result=await run.call(this,signal);return{...result,terminationVerified:false};});
 try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  const result=await executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),f.dependency);
  expect(result).toMatchObject({reason:'owned_cli_termination_unverified',collector_error:'binding_qualification_request_limit',observer_stop_reason:'binding_qualification_observer_failed',stop_witness:{predicate:'collector_limit',safety:{root_requests:1,total_requests:3},attempted:{own_requests:2,total_requests:4}}});
 }finally{spy.mockRestore();f.cleanup();}
},10000);

test('collector diagnostics keep only the first fixed code and redact arbitrary error text',async()=>{
 const f=fixture();try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  const store=new Store(p.intent.database);try{
   const deadline=Date.now()+5000;store.execute('UPDATE binding_qualification SET reserved=1,deadline=? WHERE singleton=1',[deadline]);
   for(const first of [new Error('binding_qualification_token_limit'),new Error('clock_regression'),new Error('invalid_gap'),new Error('private body /secret/location')]){
    const owner=new OwnedCliInvocation({command:realpathSync(process.execPath),args:[],cwd:f.root,durationMs:100,stdio:'ignore'});
    const lease=issueCodexBindingLease(store,p.intent.task_id,owner,deadline);
    noteQualificationCollectorError(lease,first);noteQualificationCollectorError(lease,new Error('binding_qualification_request_limit'));
    expect(qualificationCollectorError(lease)).toBe(first.message.startsWith('private body')?'unknown_collector_error':first.message);
   }
  }finally{store.close();}
 }finally{f.cleanup();}
});

test('collector failure just before owner return remains the first diagnostic',async()=>{
 const f=fixture();let lease:Parameters<typeof noteQualificationCollectorError>[0];
 const factory=localWeb.createLocalWebDomain;
 const domain=vi.spyOn(localWeb,'createLocalWebDomain').mockImplementation(options=>{
  if(options.qualificationLease)lease=options.qualificationLease;
  return factory(options);
 });
 const spawned=vi.spyOn(OwnedCliInvocation.prototype,'hasSpawned').mockReturnValue(true);
 const alive=vi.spyOn(OwnedCliInvocation.prototype,'isAlive').mockReturnValue(false);
 const run=vi.spyOn(OwnedCliInvocation.prototype,'run').mockImplementation(()=>{
  noteQualificationCollectorError(lease,new Error('clock_regression'));
  return Promise.resolve({status:'stopped',pid:42,exitCode:null,terminationVerified:false,ownershipVerified:true,controllingTerminal:true,escapedMemberObserved:false,ownedMembers:1,terminationCause:'control',groupChanges:[],groupChangesTruncated:false});
 });
 try{
  const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  const result=await executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),f.dependency);
  expect(result).toMatchObject({reason:'owned_cli_termination_unverified',collector_error:'clock_regression',first_diagnostic:{stage:'collector',code:'clock_regression'}});
 }finally{domain.mockRestore();spawned.mockRestore();alive.mockRestore();run.mockRestore();f.cleanup();}
});

for(const omitted of ['cost-dependency','built-ui'] as const)test(`frozen ${omitted} changes block before native reservation`,async()=>{
 const f=fixture();const target=omitted==='cost-dependency'?new URL('../src/catalog-cost-report.ts',import.meta.url):new URL('../dist/local-ui/index.html',import.meta.url);const original=readFileSync(target);
 try{const p=await prepareCodexSessionBindingQualification(f.dir,{binary:realpathSync(process.execPath),codexHome:f.home},f.dependency);
  writeFileSync(target,Buffer.concat([original,Buffer.from('\n')]));
  await expect(executeCodexSessionBindingQualification(p.intentPath,consent(p.sha256),f.dependency)).rejects.toThrow('binding_qualification_drift');
  const store=new Store(p.intent.database);try{expect(store.get<{reserved:number}>('SELECT reserved FROM binding_qualification')?.reserved).toBe(0);}finally{store.close();}
 }finally{writeFileSync(target,original);f.cleanup();}
});
