import { addTokens, EventSchema, TaskMetadataSchema, TimestampSchema } from './contracts.js';
import { Lifecycle, type Outcome } from './lifecycle.js';
import { Store } from './store.js';

export function tokensPerSuccess(rows: readonly {tokens:number;outcome:Outcome|null}[]):number|null {
  const total=addTokens(rows.map(row=>row.tokens));const successes=rows.filter(row=>row.outcome==='success').length;
  return successes ? total/successes : null;
}
export function changeRate(before:number,after:number):number|null {
  if(!Number.isFinite(before)||!Number.isFinite(after)||before<0||after<0)throw new Error('invalid_metric');
  return before===0?null:(after-before)/before;
}
export function aggregateTask(store:Store,taskId:string,cutoff:string){
 return store.transaction(()=>{
  const end=new Date(TimestampSchema.parse(cutoff)).toISOString();const task=new Lifecycle(store).task(taskId);
  const metadata=TaskMetadataSchema.parse(JSON.parse(task.metadata) as unknown);
  const cutoffMs=Date.parse(end);const start=task.started_at && Date.parse(task.started_at)<=cutoffMs?task.started_at:null;
  const finalized=task.finalized_at && Date.parse(task.finalized_at)<=cutoffMs?task.finalized_at:null;
  const until=finalized??end;
  const outcome=store.get<{status:Outcome;first_success:number|null;criteria_met:string;assessed_at:string}>('SELECT * FROM outcomes WHERE task_id=?',[taskId]);
  const knownOutcome=outcome && Date.parse(outcome.assessed_at)<=cutoffMs?outcome:null;
  const events=store.all<Record<string,unknown>>('SELECT * FROM events WHERE task_id=? ORDER BY occurred_at,source_key',[taskId])
    .map(row=>EventSchema.parse({...row,payload:JSON.parse(String(row.payload)) as unknown}))
    .filter(row=>start && Date.parse(row.occurred_at)>=Date.parse(start) && Date.parse(row.occurred_at)<=Date.parse(until));
  const usages=events.flatMap(row=>row.payload.kind==='usage'?[row.payload]:[]);
  const tools=events.flatMap(row=>row.payload.kind==='tool'?[row.payload]:[]);
  const readings=(field:'input_total'|'cached_input'|'output_total'|'reasoning_output')=>{
    const values=usages.flatMap(row=>row[field].status==='observed'?[row[field].value]:[]);
    const statuses={observed:0,missing:0,error:0,excluded:0,unmeasurable:0};
    const reasons:Record<string,number>={};
    for(const row of usages){const reading=row[field];statuses[reading.status]++;if(reading.reason)reasons[reading.reason]=(reasons[reading.reason]??0)+1;}
    return {observed_sum:values.length?addTokens(values):null,observed_events:values.length,unavailable_events:usages.length-values.length,status_counts:statuses,reason_counts:reasons};
  };
  const input=readings('input_total');const output=readings('output_total');
  const partialTokens=input.observed_sum!==null && output.observed_sum!==null?addTokens([input.observed_sum,output.observed_sum]):null;
  const observations=store.all<{started_at:string;ended_at:string|null;status:string;reason:string|null}>('SELECT started_at,ended_at,status,reason FROM observations WHERE task_id=? ORDER BY started_at,id',[taskId])
    .filter(row=>start && Date.parse(row.started_at)<=Date.parse(until) && Date.parse(row.ended_at??until)>=Date.parse(start))
    .map(row=>({started_at:new Date(Math.max(Date.parse(row.started_at),Date.parse(start!))).toISOString(),
      ended_at:new Date(Math.min(Date.parse(row.ended_at??until),Date.parse(until))).toISOString(),
      status:!row.ended_at || Date.parse(row.ended_at)>Date.parse(until)?'unmeasurable':row.status,
      reason:!row.ended_at || Date.parse(row.ended_at)>Date.parse(until)?'incomplete':row.reason}));
  const reasons=[...new Set([...observations.flatMap(row=>row.reason?[row.reason]:[]),...usages.flatMap(row=>[row.input_total,row.cached_input,row.output_total,row.reasoning_output].flatMap(reading=>reading.reason?[reading.reason]:[]))])].sort();
  // Current verified adapters cannot prove complete topology or whole-task coverage.
  // Complete values are intentionally unavailable, even when observed sums are zero.
  if(!reasons.includes('incomplete'))reasons.push('incomplete');
  const intervals=store.all<{started_at:string;ended_at:string|null}>('SELECT started_at,ended_at FROM active_intervals WHERE task_id=? ORDER BY started_at',[taskId]);
  let activeMs=0;let previousEnd=start?Date.parse(start):0;
  for(const interval of intervals){const a=Math.max(previousEnd,Date.parse(interval.started_at));const b=Math.min(Date.parse(interval.ended_at??until),Date.parse(until));if(b>a){activeMs=addTokens([activeMs,b-a]);previousEnd=b;}}
  return {schema_version:1,task_id:taskId,project_id:task.project_id,metadata,cutoff:end,
    outcome:knownOutcome?.status??null,first_success:task.first_assessed_at && Date.parse(task.first_assessed_at)<=cutoffMs && task.first_success!==null?task.first_success===1:null,
    criteria_met:knownOutcome?JSON.parse(knownOutcome.criteria_met) as string[]:[],
    rework_count:store.all<{started_at:string}>("SELECT started_at FROM attempts WHERE task_id=? AND kind='rework'",[taskId]).filter(r=>Date.parse(r.started_at)<=cutoffMs).length,
    usage:{status:usages.length?'partial' as const:'missing' as const,partial_tokens:partialTokens,complete_tokens:null,
      input_total:input,cached_input:readings('cached_input'),output_total:output,reasoning_output:readings('reasoning_output'),reasons:reasons.sort()},
    tools:{status:tools.length?'partial':'missing',confirmed_execution_count:tools.length?tools.filter(r=>r.execution==='confirmed').length:null,
      failed_tool_call_count:null,observed_failure_count:tools.length?tools.filter(r=>r.execution==='confirmed'&&r.outcome==='failed').length:null,
      unknown_outcome_count:tools.length?tools.filter(r=>r.outcome==='unknown').length:null,
      denied_count:tools.length?tools.filter(r=>r.outcome==='denied').length:null,
      cancelled_count:tools.length?tools.filter(r=>r.outcome==='cancelled').length:null,
      validation_failed_count:tools.length?tools.filter(r=>r.outcome==='validation_failed').length:null,
      boundaries:[...new Set(tools.map(r=>r.boundary))].sort(),classification:'unavailable',search_count:null,file_read_count:null,
      duplicate_file_read_count:null,context_expansion_count:null},
    time:{started_at:start,ended_at:until,elapsed_ms:start?Date.parse(until)-Date.parse(start):null,active_ms:start?activeMs:null,
      model_runtime_ms:null,time_to_first_edit_ms:null,time_to_first_test_ms:null,time_to_oracle_pass_ms:null,
      time_to_human_success_ms:knownOutcome?.status==='success' && start?Date.parse(knownOutcome.assessed_at)-Date.parse(start):null,
      milestones_reason:'unsupported',censored:!finalized},
    cost:null,observation_windows:observations,
    limitations:['partial_usage_is_not_a_task_total','tool_boundaries_are_not_all_external_calls','elapsed_is_not_human_labor'],
  };
 });
}
export type TaskReport=ReturnType<typeof aggregateTask>;
