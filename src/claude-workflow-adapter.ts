import { randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, openSync, readFileSync, realpathSync, mkdirSync, lstatSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { z } from 'zod';
import { IdSchema, ModelSchema } from './contracts.js';
import { bindConfigurationToSession } from './config-confirmation.js';
import { authorizeClaudeTraceScope } from './claude-trace-candidate.js';
import { prepareClaudeProbeSupervisor, verifyClaudeProbeBinary, verifyClaudeWorkflowVersion } from './claude-probe-supervisor.js';
import { recordAbandonedRunGap, recordObservationGap } from './runtime-history.js';
import type { CandidateScope } from './nested-candidate.js';
import { isClaudeWorkflowProductVersion, claudeWorkflowProfileId } from './claude-workflow-versions.js';
import { resolveSourceCompatibility, assertCompatibilityAllowed, pinSessionCompatibility, invalidateCompatibility } from './source-compatibility.js';
import type { Store } from './store.js';
import type { WorkflowAdapter, WorkflowAdapterResult } from './task-workflow.js';

/** Admitted parent-only in the code-owned registry (claude-workflow-02191-root-native-v1).
 * The version comes from the pinned binary and must match the configured product version. */
export { claudeWorkflowProfileId };
const effort = z.enum(['low','medium','high','xhigh','max']);
export const ClaudeWorkflowExecutionSchema = z.strictObject({
  operation:z.literal('launch'), run_id:IdSchema,
  binary:z.strictObject({path:z.string().min(1).max(4096),version:z.string().refine(isClaudeWorkflowProductVersion),sha256:z.string().regex(/^[a-f0-9]{64}$/)}),
  workspace:z.string().min(1).max(4096), mediator_path:z.string().min(1).max(4096), prompt_file:z.string().min(1).max(4096),
  timeout_ms:z.number().int().min(1).max(3600000), max_turns:z.number().int().min(1).max(1024),
  request_limit:z.number().int().min(1).max(1024),
  /** read-only: Read/Glob/Grep. workspace-edit adds Edit/Write; never Bash. */
  permissions:z.enum(['read-only','workspace-edit']).default('read-only'),
  /** Passed to the CLI's own estimate; not a provider or subscription spending cap. */
  max_budget_usd:z.number().min(0.01).max(1000).optional(),
  child_runtime:z.strictObject({model:ModelSchema,effort}).optional(),
});

function readPrompt(path:string):string {
  let fd:number|undefined;
  try {
    if(realpathSync(path)!==path)throw new Error('invalid');
    fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const before=fstatSync(fd);if(!before.isFile()||before.size<1||before.size>1048576)throw new Error('invalid');
    const content=readFileSync(fd,'utf8');const after=fstatSync(fd);
    if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw new Error('invalid');return content;
  }catch{throw new Error('claude_workflow_prompt_failed');}
  finally{if(fd!==undefined)closeSync(fd);}
}
/** With edit tools, any file the harness executes or trusts must be unreachable:
 * an edited hook mediator (or its sibling modules) would run model-written code. */
function harnessOutsideProject(projectRoot:string|null,paths:string[]):void {
  // native realpath returns the on-disk spelling, so case-insensitive aliases compare equal.
  const real=(path:string):string=>existsSync(path)?realpathSync.native(path):join(real(dirname(path)),basename(path));
  let root:string;
  try{if(projectRoot===null)throw new Error('missing');root=realpathSync.native(projectRoot);}
  catch{throw new Error('claude_workflow_harness_inside_project');}
  for(const path of paths){
    const resolved=real(path);
    if(resolved===root||resolved.startsWith(root+sep))throw new Error('claude_workflow_harness_inside_project');
  }
}
export function createClaudeWorkflowAdapter(store:Store,input:unknown):WorkflowAdapter { return adapter(store,input,false); }
/** Test-only trusted dependency, with a synthetic workspace and synthetic usage.
 * Never exposed as a public flag, binary option, profile, or admission override.
 */
export function createSyntheticClaudeWorkflowAdapter(store:Store,input:unknown):WorkflowAdapter { return adapter(store,input,true); }
function adapter(store:Store,input:unknown,synthetic:boolean):WorkflowAdapter {
  const e=ClaudeWorkflowExecutionSchema.parse(input);
  const compatibility=synthetic?null:resolveSourceCompatibility('claude_code',e.binary.version,'claude_workflow',claudeWorkflowProfileId);
  const admitted=(requested:string|null)=>{
    if(compatibility)assertCompatibilityAllowed(store,compatibility);
    if(requested!==null&&!effort.safeParse(requested).success)throw new Error('claude_workflow_effort_unsupported');
    if(store.get('SELECT 1 FROM claude_workflow_runs WHERE id=?',[e.run_id]))throw new Error('claude_workflow_already_reserved');
    // The admitted native profile is parent-only; child execution has no native qualification.
    if(!synthetic&&e.child_runtime)throw new Error('claude_workflow_child_unadmitted');
  };
  return {product:synthetic?'synthetic':'claude_code',productVersion:synthetic?'1.0.0':e.binary.version,
    profileId:synthetic?'synthetic-flexible-v1':claudeWorkflowProfileId,
    preflight(runtime,scope){
      admitted(runtime.effort);
      if(e.permissions==='workspace-edit')harnessOutsideProject(scope?.projectRoot??null,[e.workspace,e.mediator_path,dirname(e.mediator_path),e.prompt_file,e.binary.path,process.execPath,
        ...(store.filename&&store.filename!==':memory:'?[store.filename]:[])]);
      // Supervisor preparation verifies the binary again before any launch.
      verifyClaudeProbeBinary(e.binary,[e.binary.version]);if(!synthetic)verifyClaudeWorkflowVersion(e.binary,e.workspace);readPrompt(e.prompt_file);
    },
    async run(c){
      c.assertActive();
      admitted(c.runtime.effort);
      // The synthetic workspace scope exists only after assignment.
      if(synthetic&&!store.get('SELECT 1 FROM comparison_workspace_scope'))throw new Error('synthetic_store_required');
      const sessionId=randomUUID();const nativeSessionId=randomUUID();const processId=randomUUID();const startedAt=new Date().toISOString();
      const scope:CandidateScope={projectId:c.projectId,taskId:c.taskId,allowedRootTurnIds:[e.run_id],sessions:[{
        sessionId,rootSessionId:sessionId,parentSessionId:null,sourceId:randomUUID(),product:'claude_code',nativeSessionId,processId,agentId:null,
      }]};
      store.immediateTransaction(()=>{
        c.assertActive();
        if(store.get("SELECT 1 FROM codex_workflow_runs WHERE task_id=? AND state='running' UNION ALL SELECT 1 FROM claude_workflow_runs WHERE task_id=? AND state='running'",[c.taskId,c.taskId]))throw new Error('workflow_run_active');
        store.execute('INSERT INTO sessions(id,project_id,task_id,product,product_version) VALUES (?,?,?,?,?)',[sessionId,c.projectId,c.taskId,synthetic?'synthetic':'claude_code',synthetic?'1.0.0':e.binary.version]);
        if(compatibility)pinSessionCompatibility(store,sessionId,compatibility);
        bindConfigurationToSession(store,c.confirmationId,sessionId);
        authorizeClaudeTraceScope(store,scope,c.generation,synthetic,compatibility??undefined);
        store.execute("INSERT INTO claude_workflow_runs(id,task_id,project_id,session_id,confirmation_id,generation,instruction_manifest_hash,state,started_at) VALUES (?,?,?,?,?,?,?,'running',?)",[e.run_id,c.taskId,c.projectId,sessionId,c.confirmationId,c.generation,c.instructionManifestHash,startedAt]);
      });
      let state:WorkflowAdapterResult['state']='failed';let reason:string|null='claude_workflow_prepare_failed';let observed=0;let application:WorkflowAdapterResult['harness_application']='unapplied';
      let supervisor:Awaited<ReturnType<typeof prepareClaudeProbeSupervisor>>|undefined;let processStarted=false;
      try{
        c.assertActive();const prompt=readPrompt(e.prompt_file);c.assertActive();
        mkdirSync(e.workspace,{recursive:true,mode:0o700});
        if(realpathSync(e.workspace)!==e.workspace||!lstatSync(e.workspace).isDirectory()||(lstatSync(e.workspace).mode&0o077)!==0)throw new Error('claude_workflow_private_workspace_required');
        // One private subdirectory per run: the probe manifest and reservations are one-use.
        const runWorkspace=join(e.workspace,e.run_id);
        try{mkdirSync(runWorkspace,{mode:0o700});}catch{throw new Error('claude_workflow_private_workspace_required');}
        supervisor=await prepareClaudeProbeSupervisor({store,rootScope:scope,generation:c.generation,
          child:{sessionId:randomUUID(),sourceId:randomUUID(),agentType:'qualification-child'},workspace:runWorkspace,cwd:c.projectRoot,
          binary:e.binary,mediatorPath:e.mediator_path,durationMs:e.timeout_ms,
          workflow:{synthetic,model:c.runtime.model,effort:c.runtime.effort,childRuntime:e.child_runtime,permissions:e.permissions,maxBudgetUsd:e.max_budget_usd,
            instructions:c.instructions.map(row=>row.content).join('\n\n'),maxTurns:e.max_turns,requestLimit:e.request_limit,durationMs:e.timeout_ms,prompt,
            assertActive:()=>{c.assertActive();if(compatibility)assertCompatibilityAllowed(store,compatibility);},onChildBound:id=>bindConfigurationToSession(store,c.confirmationId,id),
            stopRequested:()=>store.get<{stop_requested:number}>('SELECT stop_requested FROM claude_workflow_runs WHERE id=?',[e.run_id])?.stop_requested!==0,
          }});
        c.assertActive();processStarted=true;const result=await supervisor.run();observed=result.state.requestsInserted;
        application=result.state.rootStarted&&result.state.lastSequence>=0?'invocation_settings_verified':'unapplied';
        state=result.status==='completed'?'completed':['stopped','timed_out'].includes(result.status)?'stopped':'failed';
        reason=result.reason;
      }catch(error){
        // Fixed diagnostics only; no producer error, prompt, response or path escapes.
        reason=error instanceof Error&&['claude_workflow_private_workspace_required','claude_workflow_prompt_failed','claude_probe_executable_mismatch'].includes(error.message)?error.message:'claude_workflow_failed';
      }finally{
        await supervisor?.dispose();
        if(compatibility?.state==='compatibility_unverified'&&['claude_probe_terminal_missing','claude_probe_executable_mismatch'].includes(reason??''))invalidateCompatibility(store,compatibility,'contract_failed');
        store.immediateTransaction(()=>{
          const endedAt=new Date().toISOString();
          // Deletion/revocation must never restore a journal, event or session.
          if(!store.get('SELECT 1 FROM claude_workflow_runs WHERE id=?',[e.run_id]))return;
          observed=store.get<{count:number}>("SELECT count(*) AS count FROM events WHERE task_id=? AND session_id IN (SELECT id FROM sessions WHERE id=? OR parent_id=?) AND json_extract(payload,'$.kind')='usage'",[c.taskId,sessionId,sessionId])!.count;
          if(state!=='completed'){try{
            const last=store.get<{at:string|null}>("SELECT max(occurred_at) AS at FROM events WHERE task_id=? AND session_id IN (SELECT id FROM sessions WHERE id=? OR parent_id=?)",[c.taskId,sessionId,sessionId])?.at;
            recordObservationGap(store,c.taskId,sessionId,last?new Date(Math.min(Date.parse(endedAt),Date.parse(last)+1)).toISOString():startedAt,endedAt,'incomplete',endedAt);
          }catch{/* Scope loss (pause, finish) forbids further measurement writes; the run still ends. */}}
          // A recovered (abandoned) run keeps its human-recorded terminal state.
          store.execute("UPDATE claude_workflow_runs SET state=?,ended_at=?,reason=?,observed_requests=? WHERE id=? AND state='running'",[state,endedAt,reason,observed,e.run_id]);
        });
      }
      return {run_id:e.run_id,session_id:sessionId,state,reason,observed_requests:observed,harness_application:application,process_started:processStarted};
    }};
}
/** Explicit fencing for a run whose process is gone; see recoverCodexWorkflow. */
export function recoverClaudeWorkflow(store:Store,runId:string,now:string=new Date().toISOString()){
  IdSchema.parse(runId);
  return store.immediateTransaction(()=>{
    const row=store.get<{state:string;task_id:string;session_id:string;started_at:string}>('SELECT state,task_id,session_id,started_at FROM claude_workflow_runs WHERE id=?',[runId]);
    if(!row)throw new Error('claude_workflow_run_missing');
    if(row.state!=='running')throw new Error('workflow_run_not_running');
    store.execute("UPDATE claude_workflow_runs SET state='failed',reason='abandoned',stop_requested=1,ended_at=? WHERE id=? AND state='running'",[now,runId]);
    const sessions=[row.session_id,...store.all<{id:string}>('SELECT id FROM sessions WHERE parent_id=?',[row.session_id]).map(s=>s.id)];
    const gaps=sessions.filter(session=>recordAbandonedRunGap(store,row.task_id,session,row.started_at,now)).length;
    return {run_id:runId,task_id:row.task_id,state:'failed' as const,reason:'abandoned' as const,observation_gaps:gaps,
      gaps_not_recorded:sessions.length-gaps,...(gaps<sessions.length?{gap_warning:'task_not_active' as const}:{})};
  });
}
export function stopClaudeWorkflow(store:Store,runId:string){
  IdSchema.parse(runId);
  return store.immediateTransaction(()=>{
    const row=store.get<{state:string}>('SELECT state FROM claude_workflow_runs WHERE id=?',[runId]);
    if(!row)throw new Error('claude_workflow_run_missing');
    if(row.state==='running')store.execute('UPDATE claude_workflow_runs SET stop_requested=1 WHERE id=?',[runId]);
    return {run_id:runId,state:row.state,stop_requested:row.state==='running'};
  });
}
