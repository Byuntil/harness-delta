import { expect, test } from 'vitest';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createCodexWorkflowAdapter, createSyntheticCodexWorkflowAdapter } from '../src/codex-workflow-adapter.js';
import { runAssignedWorkflow } from '../src/task-workflow.js';
import { stopCodexWorkflow, codexWorkflowCostFacts } from '../src/codex-workflow-journal.js';
import { Lifecycle } from '../src/lifecycle.js';
import { codexWorkflowFixture } from './helpers/codex-workflow-fixture.js';
import type { RuntimeEvidence } from '../src/flexible-contracts.js';

const runtime = { model: 'user-chosen-model', effort: 'user-chosen-effort' };
test('selected assigned harness actually reaches a fake process; resume changes runtime under the same task and accumulates own usage once', async () => {
  const f = codexWorkflowFixture(); try {
    const first = await runAssignedWorkflow(f.store, f.input, createSyntheticCodexWorkflowAdapter(f.store, f.execution('run-1'), f.script), runtime);
    expect(first.adapter_result).toMatchObject({ state: 'completed', observed_requests: 1, harness_application: 'invocation_settings_verified' });
    const session = first.adapter_result!.session_id!;
    expect(f.store.eventCount()).toBe(1);
    const second = await runAssignedWorkflow(f.store, { ...f.input, confirmation_id: 'confirmation-2', assignment: { ...f.input.assignment, task_id: 'another-id', alias_ids: ['issue-1'] } },
      createSyntheticCodexWorkflowAdapter(f.store, f.execution('run-2', 'resume', session), f.script), {model:'another-user-model',effort:null});
    expect(second).toMatchObject({ task_id: 'task-1', reused: true, assigned_variant_id: first.assigned_variant_id });
    expect(second.adapter_result).toMatchObject({ state:'completed',session_id:session,observed_requests:1 });
    expect(f.store.eventCount()).toBe(2); expect(f.store.all('SELECT id FROM sessions')).toHaveLength(1);
    const payloads = f.store.all<{payload:string}>('SELECT payload FROM runtime_evidence').map(r=>JSON.parse(r.payload) as RuntimeEvidence);
    expect(payloads.map(p=>p.model)).toEqual(['user-chosen-model','another-user-model']);
    expect(payloads[1]!.effort).toBe('native-default-effort');
    const retained = JSON.stringify(f.store.all('SELECT * FROM events'))+JSON.stringify(f.store.all('SELECT * FROM codex_workflow_runs'))+JSON.stringify(f.store.all('SELECT payload FROM comparison_confirmations'));
    expect(retained).not.toContain('SYNTHETIC_PRIVATE');
    expect(new Lifecycle(f.store).state('task-1')).toBe('active');
    expect(codexWorkflowCostFacts(f.store,'task-1').facts).toMatchObject({scope_before_access:'verified',immutable_identity:'verified',request_universe:'unknown',terminal_accounting:'unknown',continuous_observation:'unknown'});
  } finally { f.cleanup(); }
});
test('explicit new root link and foreground collect add future usage under the original task without backfill',async()=>{
  const f=codexWorkflowFixture();try{
    await runAssignedWorkflow(f.store,f.input,createSyntheticCodexWorkflowAdapter(f.store,f.execution('first'),f.script),runtime);
    const root=f.newRoot();f.appendUsage(root);
    const linked=await runAssignedWorkflow(f.store,{...f.input,confirmation_id:'link-confirmation'},createSyntheticCodexWorkflowAdapter(f.store,f.execution('link','link',root.id,root.path),f.script),runtime);
    expect(linked.adapter_result).toMatchObject({state:'completed',observed_requests:0,harness_application:'external_unverified'});
    const pending=runAssignedWorkflow(f.store,{...f.input,confirmation_id:'collect-confirmation'},createSyntheticCodexWorkflowAdapter(f.store,f.execution('collect','collect',root.id),f.script),runtime);
    const add=setTimeout(()=>f.appendUsage(root),30);const stop=setInterval(()=>{if(f.store.eventCount()===2)stopCodexWorkflow(f.store,'collect');},10);
    try{expect((await pending).adapter_result).toMatchObject({state:'stopped',observed_requests:1});}finally{clearTimeout(add);clearInterval(stop);}
    expect(f.store.all('SELECT id FROM sessions')).toHaveLength(2);expect(f.store.all('SELECT task_id FROM comparison_assignments')).toHaveLength(1);
    expect(f.store.eventCount()).toBe(2);
  }finally{f.cleanup();}
});
test.each(['replace','child','runtime','pause','delete','confirmation'] as const)('collector fails closed on %s before retaining additional usage',async(mode)=>{
  const f=codexWorkflowFixture();try{
    const root=f.newRoot();await runAssignedWorkflow(f.store,f.input,createSyntheticCodexWorkflowAdapter(f.store,f.execution('link','link',root.id,root.path),f.script),runtime);
    const pending=runAssignedWorkflow(f.store,{...f.input,confirmation_id:'collect-confirmation'},createSyntheticCodexWorkflowAdapter(f.store,f.execution('collect','collect',root.id),f.script),runtime);
    const edit=setTimeout(()=>{
      if(mode==='replace'){renameSync(root.path,root.path+'.old');writeFileSync(root.path,readFileSync(root.path+'.old'));f.appendUsage(root);}
      else if(mode==='child')f.appendUsage(root,'external-user-model',{root_turn_id:'another-root'});
      else if(mode==='runtime')f.appendUsage(root,'external-user-model',{cwd:'/outside'});
      else if(mode==='pause')new Lifecycle(f.store).pause('task-1');
      else if(mode==='delete')f.store.execute("INSERT INTO tombstones(kind,id,deleted_at) VALUES ('task','task-1',?)",[new Date().toISOString()]);
      else f.store.execute("INSERT INTO comparison_confirmations(id,task_id,occurred_at,recorded_at,payload) SELECT 'replacement-confirmation',task_id,occurred_at,recorded_at,payload FROM comparison_confirmations WHERE id='collect-confirmation'",[]);
    },30);
    try{if(['pause','delete','confirmation'].includes(mode))await expect(pending).rejects.toThrow('workflow_scope_revoked');else expect((await pending).adapter_result?.state).toBe('failed');}finally{clearTimeout(edit);}
    expect(f.store.eventCount()).toBe(0);expect(f.store.get<{state:string}>('SELECT state FROM codex_workflow_runs WHERE id=?',['collect'])?.state).toBe('failed');
  }finally{f.cleanup();}
});
test('offline usage between invocations is excluded by the new resume baseline',async()=>{
  const f=codexWorkflowFixture();try{
    const first=await runAssignedWorkflow(f.store,f.input,createSyntheticCodexWorkflowAdapter(f.store,f.execution('launch'),f.script),runtime);
    const id=first.adapter_result!.session_id!;const path=f.store.get<{source_path:string}>('SELECT source_path FROM codex_workflow_runs WHERE id=?',['launch'])!.source_path;
    f.appendUsage({id,path});await new Promise(ok=>setTimeout(ok,10));
    const second=await runAssignedWorkflow(f.store,{...f.input,confirmation_id:'resume-confirmation'},createSyntheticCodexWorkflowAdapter(f.store,f.execution('resume','resume',id),f.script),runtime);
    expect(second.adapter_result).toMatchObject({state:'completed',observed_requests:1});expect(f.store.eventCount()).toBe(2);
  }finally{f.cleanup();}
},20000); // Two bounded five-second invocations plus fixture setup.
test.each(['replace','rewrite'] as const)('a separate resume preserves the durable source identity and prefix across %s',async(mode)=>{
  const f=codexWorkflowFixture();try{
    const first=await runAssignedWorkflow(f.store,f.input,createSyntheticCodexWorkflowAdapter(f.store,f.execution('launch'),f.script),runtime);
    const id=first.adapter_result!.session_id!;const path=f.store.get<{source_path:string}>('SELECT source_path FROM codex_workflow_runs WHERE id=?',['launch'])!.source_path;
    const text=readFileSync(path,'utf8');
    if(mode==='replace'){renameSync(path,path+'.old');writeFileSync(path,text);}else writeFileSync(path,text.replace('30','31'));
    const resumed=await runAssignedWorkflow(f.store,{...f.input,confirmation_id:'resume-confirmation'},createSyntheticCodexWorkflowAdapter(f.store,f.execution('resume','resume',id),f.script),runtime);
    expect(resumed.adapter_result).toMatchObject({state:'failed',reason:'source_changed',harness_application:'unapplied'});expect(f.store.eventCount()).toBe(1);
  }finally{f.cleanup();}
});
test('binary mismatch reports unapplied and a forked source never yields usage',async()=>{
  const f=codexWorkflowFixture();try{
    const failed=await runAssignedWorkflow(f.store,f.input,createSyntheticCodexWorkflowAdapter(f.store,{...f.execution('wrong-binary'),binary:{path:process.execPath,sha256:'0'.repeat(64)}},f.script),runtime);
    expect(failed.adapter_result).toMatchObject({state:'failed',reason:'binary_mismatch',harness_application:'unapplied'});
    const root=f.newRoot();const header=JSON.parse(readFileSync(root.path,'utf8')) as {payload:Record<string,unknown>};header.payload.forked_from_id='another-root';writeFileSync(root.path,JSON.stringify(header)+'\n');
    const linked=await runAssignedWorkflow(f.store,{...f.input,confirmation_id:'fork-confirmation'},createSyntheticCodexWorkflowAdapter(f.store,f.execution('fork','link',root.id,root.path),f.script),runtime);
    expect(linked.adapter_result).toMatchObject({state:'failed',reason:'unsupported_session'});expect(f.store.eventCount()).toBe(0);
  }finally{f.cleanup();}
});
test('a response ID already owned by another session fails instead of being counted again',async()=>{
  const f=codexWorkflowFixture();try{
    await runAssignedWorkflow(f.store,f.input,createSyntheticCodexWorkflowAdapter(f.store,f.execution('launch'),f.script),runtime);
    const request=(JSON.parse(f.store.get<{payload:string}>('SELECT payload FROM runtime_evidence LIMIT 1')!.payload) as RuntimeEvidence).request_id!;
    const root=f.newRoot();await runAssignedWorkflow(f.store,{...f.input,confirmation_id:'link-confirmation'},createSyntheticCodexWorkflowAdapter(f.store,f.execution('link','link',root.id,root.path),f.script),runtime);
    const pending=runAssignedWorkflow(f.store,{...f.input,confirmation_id:'collect-confirmation'},createSyntheticCodexWorkflowAdapter(f.store,f.execution('collect','collect',root.id),f.script),runtime);
    const edit=setTimeout(()=>{const response=f.appendUsage(root);writeFileSync(root.path,readFileSync(root.path,'utf8').replace(response,request));},30);
    try{expect((await pending).adapter_result?.state).toBe('failed');}finally{clearTimeout(edit);}
    expect(f.store.eventCount()).toBe(1);expect(f.store.all('SELECT * FROM runtime_evidence')).toHaveLength(1);
  }finally{f.cleanup();}
});
test('admitted native adapter rejects an unpinned binary before prompt/source/native launch', async () => {
  const f = codexWorkflowFixture(); try {
    const adapter = createCodexWorkflowAdapter(f.store,{...f.execution('native-blocked'),prompt_file:'/absent/private-prompt'});
    await expect(adapter.run({projectId:'project-1',projectRoot:f.project,taskId:'task-1',generation:1,assignedVariantId:'variant-a',confirmationId:'confirmation-1',instructionManifestHash:'a'.repeat(64),runtime,instructions:[],assertActive:()=>{}})).rejects.toThrow('binary_mismatch');
    expect(f.store.all('SELECT * FROM codex_workflow_runs')).toEqual([]);
  } finally { f.cleanup(); }
});
test('artifact drift fails before adapter launch and used run IDs cannot automatically retry', async () => {
  const f = codexWorkflowFixture(); try {
    await runAssignedWorkflow(f.store,f.input,createSyntheticCodexWorkflowAdapter(f.store,f.execution('once'),f.script),runtime);
    await expect(runAssignedWorkflow(f.store,{...f.input,confirmation_id:'retry-confirmation'},createSyntheticCodexWorkflowAdapter(f.store,f.execution('once'),f.script),runtime)).rejects.toThrow('workflow_adapter_failed');
    for(const row of f.input.artifacts)writeFileSync(row.selected_artifacts[0]!.path,'changed');
    await expect(runAssignedWorkflow(f.store,{...f.input,confirmation_id:'drift-confirmation'},createSyntheticCodexWorkflowAdapter(f.store,f.execution('drift'),f.script),runtime)).rejects.toThrow('workflow_manifest_mismatch');
    expect(f.store.all('SELECT id FROM codex_workflow_runs')).toHaveLength(1);
  } finally { f.cleanup(); }
});
test('durable stop terminates an active fake process and leaves the human task active', async () => {
  const f=codexWorkflowFixture();try{
    writeFileSync(f.prompt,'SYNTHETIC_PRIVATE_TASK WAIT');
    const running=runAssignedWorkflow(f.store,f.input,createSyntheticCodexWorkflowAdapter(f.store,f.execution('stop-me'),f.script),runtime);
    const timer=setInterval(()=>{if(f.store.eventCount()===1){clearInterval(timer);stopCodexWorkflow(f.store,'stop-me');}},10);
    try{const result=await running;expect(result.adapter_result).toMatchObject({state:'stopped',reason:'stop_requested'});}finally{clearInterval(timer);}
    expect(new Lifecycle(f.store).state('task-1')).toBe('active');expect(f.store.eventCount()).toBe(1);
    expect(readFileSync(f.prompt,'utf8')).toContain('WAIT');
  }finally{f.cleanup();}
});
test('a concurrent invocation cannot overwrite the active confirmation or launch another process',async()=>{
  const f=codexWorkflowFixture();try{
    writeFileSync(f.prompt,'SYNTHETIC_PRIVATE_TASK WAIT');
    const running=runAssignedWorkflow(f.store,f.input,createSyntheticCodexWorkflowAdapter(f.store,f.execution('first'),f.script),runtime);
    const deadline=Date.now()+3000;while(f.store.eventCount()<1&&Date.now()<deadline)await new Promise(ok=>setTimeout(ok,10));
    expect(f.store.eventCount()).toBe(1);
    await expect(runAssignedWorkflow(f.store,{...f.input,confirmation_id:'second-confirmation'},createSyntheticCodexWorkflowAdapter(f.store,f.execution('second'),f.script),runtime)).rejects.toThrow('workflow_run_active');
    expect(f.store.get("SELECT 1 FROM comparison_confirmations WHERE id='second-confirmation'")).toBeUndefined();
    stopCodexWorkflow(f.store,'first');expect((await running).adapter_result?.state).toBe('stopped');
    expect(f.store.all('SELECT * FROM codex_workflow_runs')).toHaveLength(1);
  }finally{f.cleanup();}
});
