import { SourceFailure } from './source-errors.js';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { addTokens, IdSchema, ModelSchema, TimestampSchema, TokenSchema, type Event, type Reading } from './contracts.js';

export interface SourceScope { sessionId: string; projectRoot: string; product: 'codex' | 'claude_code'; version: string }
export interface SourceRecord { key: string; at: string; turnStartedAt: string | null; toolCallIds?: string[]; payload: Event['payload'] }
export interface Snapshot { continuityKey: string | null; records: SourceRecord[]; counters: number[] | null; counterAt: string | null; model: string | null; reasons: string[]; blocked: boolean }
const canonicalPath = (path:string):string => { try { return realpathSync(path); } catch { return resolve(path); } };
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const id = (value: unknown): string => { const result = IdSchema.safeParse(value); if (!result.success) throw new Error('unsupported'); return result.data; };
const count = (value: unknown): number => { const result = TokenSchema.safeParse(value); if (!result.success) throw new Error('unsupported'); return result.data; };
const timestamp = (value: unknown): string => { const result = TimestampSchema.safeParse(value); if (!result.success) throw new Error('unsupported'); return new Date(result.data).toISOString(); };
export const metadataKey = (...values: string[]): string => createHash('sha256').update(JSON.stringify(values)).digest('hex');
export const observed = (value: number): Reading => ({ status:'observed',value,reason:null });
export const unavailable = (): Reading => ({status:'unmeasurable',value:null,reason:'unsupported'});
export function usagePayload(scope: SourceScope, counters: number[], model: string, epoch: string): Event['payload'] {
  if (!ModelSchema.safeParse(model).success || counters.length !== 4) throw new Error('unsupported');
  const [input, cached, output, reasoning] = counters as [number,number,number,number];
  if (cached > input || reasoning > output) throw new Error('unsupported');
  return {kind:'usage',product:scope.product,product_version:scope.version,model,epoch,
    input_total:observed(input),cached_input:observed(cached),output_total:observed(output),
    // Nonzero reasoning semantics have not yet been validated for either source.
    reasoning_output: reasoning === 0 && scope.product === 'codex' ? observed(0) : unavailable()};
}

/** Only metadata leaves are retained. Raw JSON and tool arguments never escape. */
export function parseSnapshot(text: string, scope: SourceScope): Snapshot {
  if ((scope.product === 'codex' && scope.version !== '0.156.1') ||
      (scope.product === 'claude_code' && scope.version !== '2.1.283')) throw new Error('unsupported');
  const result: Snapshot = {continuityKey:null,records:[],counters:null,counterAt:null,model:null,reasons:['incomplete'],blocked:false};
  const origins: string[] = [];
  const usageComponents = new Map<string, number[]>();
  const records = new Map<string, SourceRecord>(); let identified = false; let turnStartedAt: string | null = null; const bashIds = new Map<string,string|null>(); let currentTurnId: string | null = null; let turnOpen=false;
  const add = (record: SourceRecord) => {
    const old = records.get(record.key);
    if (old && JSON.stringify(old) !== JSON.stringify(record)) throw new SourceFailure('record_conflict');
    records.set(record.key,record);
  };
  const lines = text.slice(0,text.lastIndexOf('\n')+1).split('\n').filter(Boolean);
  for (const line of lines) {
    let row: ObjectValue;
    try { row=object(JSON.parse(line)); } catch { throw new SourceFailure('invalid_json'); }
    const payload=object(row.payload);
    if (scope.product === 'codex') {
      if(!['session_meta','event_msg','response_item','world_state','turn_context','token_usage_record','compacted'].includes(String(row.type)))result.blocked=true;
      if (!identified) {
        if (row.type !== 'session_meta' || payload.id !== scope.sessionId ||
            typeof payload.cwd !== 'string' || canonicalPath(payload.cwd) !== canonicalPath(scope.projectRoot)) throw new Error('scope_mismatch');
        if (payload.cli_version !== scope.version || !['cli','exec'].includes(String(payload.source))) throw new Error('unsupported');
        identified=true;
      }
      if (row.type === 'session_meta' && (payload.id !== scope.sessionId || payload.cli_version !== scope.version || typeof payload.cwd !== 'string' || canonicalPath(payload.cwd)!==canonicalPath(scope.projectRoot) || !['cli','exec'].includes(String(payload.source)))) throw new Error('scope_mismatch');
      if (row.type === 'compacted' || payload.type === 'context_compacted' || payload.type === 'token_count' && object(payload.info).total_token_usage === null ||
          payload.forked_from_id || (row.type === 'event_msg' && String(payload.type).startsWith('collab_'))) result.blocked=true;
      if (row.type === 'event_msg' && payload.type === 'task_started') {
        if(turnOpen)result.blocked=true;
        currentTurnId=id(payload.turn_id);turnOpen=true;turnStartedAt=timestamp(row.timestamp);
      }
      if (row.type === 'event_msg' && payload.type === 'task_complete') {
        if(payload.turn_id!==currentTurnId)result.blocked=true;turnOpen=false;
      }
      if (row.type === 'turn_context') {
        if(typeof payload.cwd==='string' && canonicalPath(payload.cwd)!==canonicalPath(scope.projectRoot))throw new Error('scope_mismatch');
        if (!ModelSchema.safeParse(payload.model).success) throw new Error('unsupported');
        if (result.model && result.model !== payload.model) result.blocked=true;
        result.model=String(payload.model);
      }
      if (row.type === 'event_msg' && payload.type === 'token_count' && payload.info !== null) {
        const usage=object(object(payload.info).total_token_usage);
        const counters=['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens'].map(k=>count(usage[k]));
        if (result.counters && counters.some((v,i)=>v < result.counters![i]!)) result.blocked=true;
        const previous=result.counters ?? [0,0,0,0];
        // A first explicit vector is evidence even at zero. Subsequent equal
        // cumulative notifications have no new observation identity.
        if (!result.blocked && result.model && (!result.counters || counters.some((v,i)=>v !== previous[i]))) {
          const deltas=counters.map((v,i)=>v-previous[i]!);
          add({key:metadataKey(scope.sessionId,'usage',...counters.map(String)),at:timestamp(row.timestamp),turnStartedAt,
            payload:usagePayload(scope,deltas,result.model,'sequential')});
        }
        result.counters=counters;result.counterAt=timestamp(row.timestamp);
      }
      if (row.type === 'event_msg' && payload.type === 'item_completed') {
        const item=object(payload.item);
        if (item.type === 'CommandExecution') {
          const callId=id(item.id);
          if(!currentTurnId || payload.turn_id!==currentTurnId || !Number.isSafeInteger(payload.started_at_ms) || !Number.isSafeInteger(payload.completed_at_ms)){result.blocked=true;continue;}
          const actualStart=new Date(Number(payload.started_at_ms)).toISOString();
          const originStart=turnStartedAt && turnStartedAt<actualStart?turnStartedAt:actualStart;
          const confirmed=Number.isSafeInteger(item.exit_code);
          add({key:metadataKey(scope.sessionId,'command',callId),at:timestamp(row.timestamp),turnStartedAt:originStart,payload:{kind:'tool',call_id:callId,boundary:'codex_command',execution:confirmed?'confirmed':'unknown',outcome:confirmed && item.exit_code===0?'completed':'unknown',category:'unclassified'}});
        }
      }
    } else {
      // The verified transcript identifies each message. Auxiliary records do not
      // contribute usage; absence of complete topology evidence remains partial.
      if(row.sessionId!==undefined && row.sessionId!==scope.sessionId)throw new Error('scope_mismatch');
      if (['assistant','user','attachment'].includes(String(row.type)) || row.cwd !== undefined || row.version !== undefined) {
        if (row.sessionId !== scope.sessionId || typeof row.cwd !== 'string' || canonicalPath(row.cwd) !== canonicalPath(scope.projectRoot)) throw new Error('scope_mismatch');
        if (row.version !== scope.version) throw new Error('unsupported');
        identified=true;
      }
      if (row.isSidechain === true || row.type === 'system' && row.subtype === 'compact_boundary') result.blocked=true;
      if (row.type === 'user' && row.toolUseResult === undefined && row.sessionId === scope.sessionId && typeof row.promptId === 'string' && !array(object(row.message).content).some(value=>object(value).type==='tool_result')) { turnStartedAt=timestamp(row.timestamp); origins.push(turnStartedAt); }
      if (row.type === 'assistant') {
        if (row.sessionId !== scope.sessionId) throw new Error('scope_mismatch');
        const message=object(row.message); const usage=object(message.usage);
        const callId=id(message.id);
        const key=metadataKey(scope.sessionId,'message',callId);
        // Replayed messages keep their original origin, including an unknown one.
        // Payload and timestamp still pass through add()'s conflict check.
        const origin=records.has(key)?records.get(key)!.turnStartedAt:turnStartedAt;
        // Retain only recognized invocation IDs so revisions cannot invent tools.
        // Including this metadata in the record also protects cross-poll fingerprints.
        const toolCallIds=[...new Set(array(message.content).flatMap(value=>{
          const block=object(value);return block.type==='tool_use' && block.name==='Bash'?[id(block.id)]:[];
        }))].sort();
        const components=[count(usage.input_tokens),count(usage.cache_creation_input_tokens),count(usage.cache_read_input_tokens)];
        const priorComponents=usageComponents.get(key);
        if(priorComponents && components.some((value,index)=>value!==priorComponents[index]))throw new SourceFailure('record_conflict');
        if(!priorComponents)usageComponents.set(key,components);
        const input=addTokens(components);
        const model=ModelSchema.safeParse(message.model); if (!model.success) throw new Error('unsupported');
        const counters=[input,count(usage.cache_read_input_tokens),count(usage.output_tokens),0];
        add({key,at:timestamp(row.timestamp),turnStartedAt:origin,toolCallIds,payload:usagePayload(scope,counters,model.data,'sequential')});
        for(const toolId of toolCallIds)if(!bashIds.has(toolId))bashIds.set(toolId,origin);
      }
      if (row.type === 'user' && row.toolUseResult !== undefined) {
        const toolResult=object(row.toolUseResult);
        for (const value of array(object(row.message).content)) {
          const block=object(value);
          // Only the observed Bash result shape confirms a completed operation.
          if (block.type==='tool_result' && bashIds.has(String(block.tool_use_id)) && typeof toolResult.stdout==='string' && typeof toolResult.stderr==='string') {
            const callId=id(block.tool_use_id);const confirmed=block.is_error===false && toolResult.interrupted===false;
            add({key:metadataKey(scope.sessionId,'bash',callId),at:timestamp(row.timestamp),turnStartedAt:bashIds.get(callId)??null,payload:{kind:'tool',call_id:callId,boundary:'claude_bash',execution:confirmed?'confirmed':'unknown',outcome:confirmed?'completed':'unknown',category:'unclassified'}});
          }
        }
      }
    }
  }
  if (!identified) throw new Error('scope_mismatch');
  result.records=[...records.values()];
  if (result.blocked) result.reasons.push('unsupported');
  // Only validated measurement metadata enters this fingerprint. Origins matter
  // even before usage arrives; a metadata-only snapshot of usage is insufficient.
  // Raw lines, contents and hashes of contents are never checkpointed.
  if (scope.product === 'claude_code') result.continuityKey=metadataKey(JSON.stringify({
    records:result.records,blocked:result.blocked,origins,usageComponents:[...usageComponents],
    incompleteLine:text.length>text.lastIndexOf('\n')+1,
  }));
  return result;
}
