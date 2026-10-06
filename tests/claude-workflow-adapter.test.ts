import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { ClaudeWorkflowExecutionSchema, createClaudeWorkflowAdapter, createSyntheticClaudeWorkflowAdapter, recoverClaudeWorkflow } from '../src/claude-workflow-adapter.js';
import { registerPriceTable } from '../src/pricing.js';
import { makeFlexibleFixture } from './helpers/flexible-fixture.js';
import { readObservedCostReport } from '../src/observed-cost-report.js';
import { runAssignedWorkflow } from '../src/task-workflow.js';
import { Lifecycle } from '../src/lifecycle.js';
import { codexWorkflowFixture } from './helpers/codex-workflow-fixture.js';
import { compiledWorker } from './helpers/compiled-worker.js';

function fixture(mode='child',version='2.1.291',appVersion=version) {
  const f=codexWorkflowFixture();const compiled=compiledWorker(f.root);const binary=join(f.root,'fake-claude');
  writeFileSync(binary,`#!${process.execPath}
const fs=require('node:fs');const cp=require('node:child_process');
(async()=>{const args=process.argv.slice(2);const get=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined;const settings=JSON.parse(fs.readFileSync(get('--settings'),'utf8'));const env=settings.env;const native=get('--session-id');const processId=JSON.parse(env.OTEL_RESOURCE_ATTRIBUTES_JSON??'null');
const resource=env.OTEL_RESOURCE_ATTRIBUTES;const pid=resource.split(',').find(x=>x.startsWith('harness_delta.process_id=')).slice('harness_delta.process_id='.length);
const token=Object.fromEntries(env.OTEL_EXPORTER_OTLP_HEADERS.split(',').map(x=>x.split('=')));
const endpoint=env.OTEL_EXPORTER_OTLP_ENDPOINT;let prompt='';for await(const chunk of process.stdin)prompt+=chunk;
const instructions=fs.readFileSync(get('--append-system-prompt-file'),'utf8');if(!instructions.startsWith('SYNTHETIC_PRIVATE_HARNESS_')||!prompt.startsWith('SYNTHETIC_PRIVATE_TASK'))process.exit(3);
if(args.includes('--agents')&&fs.readFileSync(get('--append-subagent-system-prompt-file'),'utf8')!==instructions)process.exit(4);
const attrs=o=>Object.entries(o).filter(([,v])=>v!==undefined).map(([key,v])=>({key,value:typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{boolValue:v}:{intValue:String(v)}}));
const post=async(route,body)=>{const res=await fetch(endpoint+route,{method:'POST',headers:{...token,'content-type':'application/json'},body:JSON.stringify(body)});if(!res.ok)process.exit(5);};
const hook=(name,extra={})=>{const cmd=settings.hooks[name][0].hooks[0].command;const res=cp.spawnSync('/bin/sh',['-c',cmd],{input:JSON.stringify({hook_event_name:name,session_id:native,cwd:process.cwd(),...extra})});if(res.status!==0||JSON.parse(res.stdout.toString()||'{}').continue===false)process.exit(6);};
const now=()=>new Date().toISOString();const base={'harness_delta.process_id':pid,'session.id':native,'app.version':${JSON.stringify(appVersion)}};
const log=(seq,name,extra={})=>({resourceLogs:[{scopeLogs:[{logRecords:[{attributes:attrs({...base,'event.name':name,'event.sequence':seq,'event.timestamp':now(),...extra})}]}]}]});
const startup=log(0,'managed_settings_resolved',{'managed_settings.trigger':'startup'});startup.resourceLogs[0].scopeLogs[0].logRecords[0].attributes.push({key:'managed_settings.sources',value:{arrayValue:{values:[]}}});
await post('/v1/logs',startup);
if(${JSON.stringify(mode)}==='hook-before-start'){for(let seq=1;seq<=12;seq++)await post('/v1/logs',log(seq,'synthetic-startup-note'));hook('SessionEnd');process.exit(7);}
hook('SessionStart',{source:'startup',model:get('--model')??'inherited-model'});
const trace=(id,child=false)=>{const end=BigInt(Date.now())*1000000n;return {name:'claude_code.llm_request',traceId:'1'.repeat(32),spanId:(child?'3':'2').repeat(16),startTimeUnixNano:String(end-1n),endTimeUnixNano:String(end),status:{code:0},attributes:attrs({...base,agent_id:child?'child-agent':undefined,request_id:native+'-'+id,model:child?'child-model':get('--model')??'inherited-model',effort:child?'low':get('--effort'),input_tokens:30,cache_read_tokens:20,cache_creation_tokens:10,output_tokens:15,success:true,attempt:1})};};
const batch=s=>({resourceSpans:[{scopeSpans:[{spans:s}]}]});const first=batch([trace('root1')]);await post('/v1/traces',first);await post('/v1/traces',first);
const duplicateLog=log(1,'api_request',{request_id:native+'-root1',input_tokens:99999,output_tokens:99999});await post('/v1/logs',duplicateLog);await post('/v1/logs',duplicateLog);
if(${JSON.stringify(mode)}==='error'){await post('/v1/logs',log(2,'api_error'));process.exit(7);}
if(${JSON.stringify(mode)}==='incomplete'){const broken=trace('unfinished');broken.endTimeUnixNano='0';await post('/v1/traces',batch([broken]));process.exit(7);}
if(${JSON.stringify(mode)}==='wait'){setTimeout(()=>{},60000);return;}
if(args.includes('--agents')){hook('PreToolUse',{tool_name:'Agent',tool_use_id:'agent-use',tool_input:{subagent_type:'qualification-child',model:'child-model'}});hook('SubagentStart',{agent_id:'child-agent',agent_type:'qualification-child'});const child=batch([trace('child1',true)]);await post('/v1/traces',child);await post('/v1/traces',child);hook('SubagentStop',{agent_id:'child-agent',agent_type:'qualification-child'});await post('/v1/traces',batch([trace('root2')]));}
if(${JSON.stringify(mode)}!=='missing-end')hook('SessionEnd');process.exit(0);
})().catch(()=>process.exit(8));
`);chmodSync(binary,0o700);
  registerPriceTable(f.store,{...makeFlexibleFixture().priceTable,id:'claude-prices',entries:['root-model','child-model','inherited-model'].flatMap(model=>([['ordinary_input','2'],['cache_read','1'],['cache_write','3'],['output','4']] as const).map(([component,price_per_unit])=>({product:'synthetic',model,component,price_per_unit})))});
  const execution={operation:'launch',run_id:'claude-run',binary:{path:binary,version,sha256:createHash('sha256').update(readFileSync(binary)).digest('hex')},workspace:join(f.root,'claude-workspace'),mediator_path:join(compiled,'claude-probe-hook-mediator.js'),prompt_file:f.prompt,timeout_ms:12000,max_turns:3,request_limit:4,...(mode==='child'?{child_runtime:{model:'child-model',effort:'low'}}:{})};
  return {...f,compiled,execution};
}

test('native Claude gate rejects before task assignment, executable access and source reads',async()=>{
  const f=fixture();try{
    await expect(runAssignedWorkflow(f.store,f.input,createClaudeWorkflowAdapter(f.store,f.execution),{model:'root-model',effort:'high'})).rejects.toThrow('workflow_adapter_mismatch');
    expect(f.store.all('SELECT * FROM comparison_assignments')).toHaveLength(0);expect(f.store.all('SELECT * FROM claude_workflow_runs')).toHaveLength(0);expect(f.store.eventCount()).toBe(0);
  }finally{f.cleanup();}
});

for(const mode of ['root','child','error','incomplete','missing-end','hook-before-start'])test(`shared assigned Claude workflow handles ${mode} with a real synthetic process`,async()=>{
  const f=fixture(mode);try{
    const result=await runAssignedWorkflow(f.store,f.input,createSyntheticClaudeWorkflowAdapter(f.store,f.execution),{model:'root-model',effort:'high'});
    const success=['root','child'].includes(mode);const count=mode==='child'?3:mode==='hook-before-start'?0:1;expect(result.adapter_result).toMatchObject({state:success?'completed':mode==='missing-end'?'failed':'stopped',observed_requests:count,harness_application:mode==='hook-before-start'?'unapplied':'invocation_settings_verified'});
    if(mode==='hook-before-start'){expect(f.store.eventCount()).toBe(0);expect(result.complete_cost).toBeNull();return;}
    expect(result.complete_cost).toBeNull();expect(f.store.eventCount()).toBe(mode==='child'?3:1);
    const runtime=f.store.all<{model:string;effort:string}>("SELECT json_extract(payload,'$.model') AS model,json_extract(payload,'$.effort') AS effort FROM runtime_evidence ORDER BY rowid");expect(runtime[0]).toEqual({model:'root-model',effort:'high'});
    if(mode==='child')expect(runtime[1]).toEqual({model:'child-model',effort:'low'});
    expect(f.store.all('SELECT * FROM comparison_assignments')).toHaveLength(1);
    expect(f.store.all('SELECT * FROM comparison_confirmation_sessions')).toHaveLength(mode==='child'?2:1);
    const usage=JSON.parse(f.store.get<{payload:string}>('SELECT payload FROM events ORDER BY rowid LIMIT 1')!.payload) as {input_total:{value:number};product:string};expect(usage.input_total.value).toBe(60);expect(usage.product).toBe('synthetic');
    expect(f.store.all('SELECT * FROM observation_gaps')).not.toHaveLength(0);
    const table='claude-prices';
    const report=readObservedCostReport(f.store,result.task_id,table,new Date(Date.now()+2).toISOString(),'output-only-v1');
    expect(report).toMatchObject({event_count:mode==='child'?3:1,complete_amount:null,partial_amount:mode==='child'?'0.51':'0.17'});
    expect(JSON.stringify(result)).not.toContain('SYNTHETIC_PRIVATE');
    expect(()=>f.store.execute("INSERT INTO otel_processes(id,task_id) VALUES ('second-channel',?)",[result.task_id])).toThrow('claude_workflow_source_conflict');
    expect(()=>f.store.execute("INSERT INTO observation_runs(id,task_id) VALUES ('second-channel',?)",[result.task_id])).toThrow('claude_workflow_source_conflict');
    expect(()=>f.store.execute('UPDATE sessions SET source_path=? WHERE task_id=?',['/synthetic-source',result.task_id])).toThrow('claude_workflow_source_conflict');
  }finally{f.cleanup();}
},20000);

test('actual main CLI connects Claude assignment, launch, trace collector and durable stop',async()=>{
  const f=fixture('wait');try{
    const entry=join(f.root,'cli.mjs');writeFileSync(entry,`import {main} from ${JSON.stringify(join(f.compiled,'cli.js'))};import {createSyntheticClaudeWorkflowAdapter} from ${JSON.stringify(join(f.compiled,'claude-workflow-adapter.js'))};process.exitCode=await main(process.argv.slice(2),{claudeAdapter:createSyntheticClaudeWorkflowAdapter});`);
    const config=join(f.root,'config.json');const runtime=join(f.root,'runtime.json');const execution=join(f.root,'execution.json');writeFileSync(config,JSON.stringify(f.input));writeFileSync(runtime,JSON.stringify({model:null,effort:null}));writeFileSync(execution,JSON.stringify(f.execution));
    const call=(args:string[])=>new Promise<{code:number|null;stdout:string;stderr:string}>((ok,no)=>{const child=spawn(process.execPath,[entry,'--db',f.database,'workflow','claude',...args],{stdio:['ignore','pipe','pipe']});let stdout='';let stderr='';child.stdout.on('data',b=>{stdout+=String(b);});child.stderr.on('data',b=>{stderr+=String(b);});child.on('error',no);child.on('exit',code=>ok({code,stdout,stderr}));});
    const launched=call(['launch','--config',config,'--runtime',runtime,'--execution',execution]);const deadline=Date.now()+12000;
    while(f.store.eventCount()!==1&&Date.now()<deadline)await new Promise(ok=>setTimeout(ok,20));expect(f.store.eventCount()).toBe(1);
    expect((await call(['stop','claude-run'])).code).toBe(0);const stopped=await launched;expect(stopped.code,stopped.stderr+stopped.stdout).toBe(0);
    expect((JSON.parse(stopped.stdout) as {adapter_result:unknown}).adapter_result).toMatchObject({state:'stopped',reason:'stop_requested',observed_requests:1});
    expect(f.store.all('SELECT * FROM comparison_assignments')).toHaveLength(1);expect(stopped.stdout).not.toContain('SYNTHETIC_PRIVATE');
  }finally{f.cleanup();}
},20000);


test('a Claude workspace failure before launch reports its code and pauses the task it started',async()=>{
  const f=fixture('root');try{
    mkdirSync(f.execution.workspace,{mode:0o755});chmodSync(f.execution.workspace,0o755);
    const result=await runAssignedWorkflow(f.store,f.input,createSyntheticClaudeWorkflowAdapter(f.store,f.execution),{model:null,effort:null});
    expect(result).toMatchObject({state:'paused',activation_reverted:true,adapter_result:{state:'failed',reason:'claude_workflow_private_workspace_required',process_started:false}});
    expect(f.store.all('SELECT id FROM active_intervals WHERE ended_at IS NULL')).toEqual([]);
  }finally{f.cleanup();}
});
test('a recovered Claude run keeps its abandoned state after its live process stops',async()=>{
  const f=fixture('wait');try{
    const launched=runAssignedWorkflow(f.store,f.input,createSyntheticClaudeWorkflowAdapter(f.store,f.execution),{model:null,effort:null});
    const deadline=Date.now()+12000;while(f.store.eventCount()!==1&&Date.now()<deadline)await new Promise(ok=>setTimeout(ok,20));expect(f.store.eventCount()).toBe(1);
    expect(recoverClaudeWorkflow(f.store,'claude-run')).toMatchObject({state:'failed',reason:'abandoned'});
    await launched;
    expect(f.store.get('SELECT state,reason FROM claude_workflow_runs WHERE id=?',['claude-run'])).toEqual({state:'failed',reason:'abandoned'});
  }finally{f.cleanup();}
},20000);

test('the native Claude adapter is parent-only and rejects a child before assignment',()=>{
  const f=fixture('child');try{
    expect(()=>createClaudeWorkflowAdapter(f.store,f.execution).preflight?.({model:null,effort:null})).toThrow(/^claude_workflow_child_unadmitted$/);
    expect(()=>createClaudeWorkflowAdapter(f.store,{...f.execution,child_runtime:undefined}).preflight?.({model:null,effort:null})).not.toThrow();
    expect(f.store.all('SELECT * FROM comparison_assignments')).toHaveLength(0);
  }finally{f.cleanup();}
});
test('Claude execution limits follow the one-hour workflow bound and default to read-only',()=>{
  const f=fixture('root');try{
    const parsed=ClaudeWorkflowExecutionSchema.parse({...f.execution,timeout_ms:3600000,max_turns:1024,request_limit:1024});
    expect(parsed).toMatchObject({permissions:'read-only'});expect(parsed.max_budget_usd).toBeUndefined();
    for(const bad of [{timeout_ms:3600001},{request_limit:1025},{max_turns:1025},{permissions:'bash'},{max_budget_usd:0},{max_budget_usd:0.001}])
      expect(ClaudeWorkflowExecutionSchema.safeParse({...f.execution,...bad}).success).toBe(false);
  }finally{f.cleanup();}
});
test('pausing the task during a Claude run ends that run instead of leaving it running',async()=>{
  const f=fixture('wait');try{
    const launched=runAssignedWorkflow(f.store,f.input,createSyntheticClaudeWorkflowAdapter(f.store,f.execution),{model:null,effort:null});
    const deadline=Date.now()+12000;while(f.store.eventCount()!==1&&Date.now()<deadline)await new Promise(ok=>setTimeout(ok,20));expect(f.store.eventCount()).toBe(1);
    const taskId=f.store.get<{task_id:string}>('SELECT task_id FROM claude_workflow_runs WHERE id=?',['claude-run'])!.task_id;
    new Lifecycle(f.store).pause(taskId);
    // Pausing revokes the measurement scope; the shared orchestrator reports that, not an adapter failure.
    await expect(launched).rejects.toThrow(/^workflow_scope_revoked$/);
    // Either scope-loss detector (supervisor poll or gateway authorization) may end it first.
    const run=f.store.get<{state:string;reason:string}>('SELECT state,reason FROM claude_workflow_runs WHERE id=?',['claude-run'])!;
    expect(run.state).toBe('stopped');expect(['workflow_scope_revoked','claude_probe_observation_stopped']).toContain(run.reason);
    expect(f.store.eventCount()).toBe(1);
    // The in-flight interval after the last stored usage is marked at the pause itself.
    const usageAt=f.store.get<{at:string}>('SELECT max(occurred_at) AS at FROM events')!.at;
    const gaps=f.store.all<{reason:string;started_at:string}>("SELECT reason,started_at FROM observation_gaps WHERE reason='incomplete'");
    expect(gaps).toHaveLength(1);expect(Date.parse(gaps[0]!.started_at)).toBeGreaterThan(Date.parse(usageAt));
  }finally{f.cleanup();}
},20000);
test('a second Claude launch on the same task can reuse the workspace directory',async()=>{
  const f=fixture('root');try{
    const first=await runAssignedWorkflow(f.store,f.input,createSyntheticClaudeWorkflowAdapter(f.store,f.execution),{model:null,effort:null});
    expect(first.adapter_result).toMatchObject({state:'completed'});
    const second=await runAssignedWorkflow(f.store,{...f.input,confirmation_id:'confirmation-2'},createSyntheticClaudeWorkflowAdapter(f.store,{...f.execution,run_id:'claude-run-2'}),{model:null,effort:'low'});
    expect(second).toMatchObject({task_id:first.task_id,assigned_variant_id:first.assigned_variant_id,adapter_result:{state:'completed'}});
    expect(f.store.all('SELECT id FROM claude_workflow_runs')).toHaveLength(2);
  }finally{f.cleanup();}
},20000);

test('an already owned collection channel prevents Claude trace ownership before process launch',async()=>{
  const f=fixture('root');try{
    const native=createSyntheticClaudeWorkflowAdapter(f.store,f.execution);
    // A synthetic store rejects file sources outright, so a managed run is the other owner.
    await expect(runAssignedWorkflow(f.store,f.input,{...native,run:async c=>{
      const at=new Date().toISOString();
      f.store.execute("INSERT INTO sessions(id,task_id,project_id,product,product_version) VALUES ('managed-session',?,?,'synthetic','1.0.0')",[c.taskId,c.projectId]);
      f.store.execute("INSERT INTO observation_runs(id,project_id,task_id,session_id,generation,profile_id,state,started_at,updated_at,input_facts,output_facts) VALUES ('managed-run',?,?,'managed-session',?,'synthetic-managed-v1','running',?,?,'{}','{}')",[c.projectId,c.taskId,c.generation,at,at]);
      return native.run(c);
    }},{model:'root-model',effort:'high'})).rejects.toThrow(/^candidate_mixed_sources$/);
    expect(f.store.all('SELECT * FROM claude_workflow_runs')).toHaveLength(0);expect(f.store.eventCount()).toBe(0);
  }finally{f.cleanup();}
});
test('a 2.1.291 binary runs the shared workflow when its telemetry reports 2.1.291 and stops on another version',async()=>{
  const ok=fixture('root','2.1.291');try{
    const result=await runAssignedWorkflow(ok.store,ok.input,createSyntheticClaudeWorkflowAdapter(ok.store,ok.execution),{model:'root-model',effort:'high'});
    expect(result.adapter_result).toMatchObject({state:'completed',observed_requests:1});expect(ok.store.eventCount()).toBe(1);
  }finally{ok.cleanup();}
  const drift=fixture('root','2.1.291','2.1.288');try{
    const result=await runAssignedWorkflow(drift.store,drift.input,createSyntheticClaudeWorkflowAdapter(drift.store,drift.execution),{model:'root-model',effort:'high'});
    expect(result.adapter_result).toMatchObject({state:'stopped',observed_requests:0});expect(drift.store.eventCount()).toBe(0);
  }finally{drift.cleanup();}
},20000);
