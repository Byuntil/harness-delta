import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { metadataKey, usagePayload, type Snapshot, type SourceRecord, type SourceScope } from '../../src/adapters.js';
import { IdSchema, ModelSchema, TimestampSchema, TokenSchema } from '../../src/contracts.js';
import { SourceFailure } from '../../src/source-errors.js';
import { admissionCatalog, traverseCatalog, type CatalogTraversal } from './catalog.js';
import type { ConformanceCandidate } from './candidate.js';
import type { CounterVector, TurnContextFact, TurnPair } from './checks.js';

export interface InspectionTopology {
  readonly taskStartedTurnId: string | null;
  readonly taskCompleteTurnId: string | null;
  readonly turnId: string | null;
  readonly rootTurnId: string | null;
  readonly collaborationModePresent: boolean;
  readonly multiAgentVersionPresent: boolean;
  readonly threadSettingsApplied: 'absent' | 'ambiguous';
  readonly sessionMetaId: string | null;
  readonly sessionMetaSessionId: string | null;
  readonly linkedSessionId: string | null;
  readonly pairs: readonly TurnPair[];
  readonly turnContexts: readonly TurnContextFact[];
}

export interface CandidateInspection extends Snapshot {
  readonly vectors: {
    readonly total: CounterVector | null;
    readonly last: CounterVector | null;
    readonly exec: CounterVector | null;
    readonly priorTotal: CounterVector | null;
  };
  readonly topology: InspectionTopology;
  readonly traversal: CatalogTraversal;
}

type ObjectValue = Record<string, unknown>;
const canonicalPath = (path: string): string => { try { return realpathSync(path); } catch { return resolve(path); } };
const object = (value: unknown): ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
const id = (value: unknown): string => { const result = IdSchema.safeParse(value); if (!result.success) throw new Error('unsupported'); return result.data; };
const count = (value: unknown): number => { const result = TokenSchema.safeParse(value); if (!result.success) throw new Error('unsupported'); return result.data; };
const timestamp = (value: unknown): string => { const result = TimestampSchema.safeParse(value); if (!result.success) throw new Error('unsupported'); return new Date(result.data).toISOString(); };
const listed = (names: readonly string[], value: unknown): boolean => names.includes(String(value));
const exactName = (names: readonly string[], value: unknown): boolean => typeof value === 'string' && names.includes(value);
const textOrNull = (value: unknown): string | null => typeof value === 'string' ? value : null;
const allowedSources = ['cli', 'exec'];

function requiredVector(usage: ObjectValue, fields: readonly string[]): CounterVector {
  const values = new Map<string, number>();
  for (const field of fields) {
    if (!Object.hasOwn(usage, field)) throw new Error('unsupported');
    values.set(field, count(usage[field]));
  }
  const input = values.get('input_tokens');
  const cached = values.get('cached_input_tokens');
  const output = values.get('output_tokens');
  const reasoning = values.get('reasoning_output_tokens');
  const cacheWrite = values.get('cache_write_input_tokens');
  if (input === undefined || cached === undefined || output === undefined || reasoning === undefined || cacheWrite === undefined) {
    throw new Error('unsupported');
  }
  if (cacheWrite > input) throw new Error('unsupported');
  return {
    input, cached, output, reasoning, cacheWrite,
    totalTokens: Object.hasOwn(usage, 'total_tokens') ? count(usage.total_tokens) : null,
  };
}

function optionalVector(usage: ObjectValue): CounterVector {
  const read = (field: string): number | null => Object.hasOwn(usage, field) ? count(usage[field]) : null;
  return {
    input: read('input_tokens'), cached: read('cached_input_tokens'), output: read('output_tokens'),
    reasoning: read('reasoning_output_tokens'), cacheWrite: read('cache_write_input_tokens'),
    totalTokens: read('total_tokens'),
  };
}

export function parseCandidate(text: string, scope: SourceScope, candidate: ConformanceCandidate): CandidateInspection {
  const version: string = candidate.version;
  const admitted: boolean = candidate.admitted;
  if (version !== '0.158.0' || admitted !== false || scope.product !== candidate.product || scope.version !== version) {
    throw new Error('unsupported');
  }
  if (candidate.counterMode !== 'cumulative_total') throw new Error('unsupported');
  const result: Snapshot = { continuityKey: null, records: [], counters: null, counterAt: null, model: null, reasons: ['incomplete'], blocked: false };
  const records = new Map<string, SourceRecord>();
  let identified = false;
  let turnStartedAt: string | null = null;
  let currentTurnId: string | null = null;
  let turnOpen = false;
  let latestTotal: CounterVector | null = null;
  let latestLast: CounterVector | null = null;
  let taskStartedTurnId: string | null = null;
  let taskCompleteTurnId: string | null = null;
  let turnId: string | null = null;
  let rootTurnId: string | null = null;
  let collaborationModePresent = false;
  let multiAgentVersionPresent = false;
  let threadSettingsApplied: 'absent' | 'ambiguous' = 'absent';
  let sessionMetaId: string | null = null;
  let sessionMetaSessionId: string | null = null;
  const pairs: TurnPair[] = [];
  const turnContexts: TurnContextFact[] = [];
  let openPair: TurnPair | null = null;
  const parsedRows: ObjectValue[] = [];
  const lines = text.slice(0, text.lastIndexOf('\n') + 1).split('\n').filter(Boolean);
  for (const line of lines) {
    let row: ObjectValue;
    try { row = object(JSON.parse(line)); } catch { throw new SourceFailure('invalid_json'); }
    parsedRows.push(row);
    const payload = object(row.payload);
    if (!listed(candidate.recognizedTypes, row.type)) result.blocked = true;
    if (!identified) {
      if (row.type !== 'session_meta' || payload.id !== scope.sessionId ||
          typeof payload.cwd !== 'string' || canonicalPath(payload.cwd) !== canonicalPath(scope.projectRoot)) throw new Error('scope_mismatch');
      if (payload.cli_version !== scope.version || !allowedSources.includes(String(payload.source))) throw new Error('unsupported');
      identified = true;
    }
    if (row.type === 'session_meta' && (payload.id !== scope.sessionId || payload.cli_version !== scope.version || typeof payload.cwd !== 'string' || canonicalPath(payload.cwd) !== canonicalPath(scope.projectRoot) || !allowedSources.includes(String(payload.source)))) throw new Error('scope_mismatch');
    if (row.type === 'session_meta') {
      sessionMetaId = textOrNull(payload.id);
      sessionMetaSessionId = textOrNull(payload.session_id);
      if (payload.session_id !== undefined && payload.session_id !== payload.id) result.blocked = true;
    }
    if (exactName(candidate.blockingTypes, row.type) || payload.type === 'context_compacted' || payload.type === 'token_count' && object(payload.info).total_token_usage === null ||
        payload.forked_from_id || (row.type === 'event_msg' && String(payload.type).startsWith('collab_'))) result.blocked = true;
    if (row.type === 'event_msg' && payload.type === 'thread_settings_applied') {
      result.blocked = true;
      threadSettingsApplied = 'ambiguous';
    }
    if (listed(candidate.excludedTypes, row.type)) continue;
    if (row.type === 'event_msg' && payload.type === 'task_started') {
      if (turnOpen) result.blocked = true;
      currentTurnId = id(payload.turn_id); turnOpen = true; turnStartedAt = timestamp(row.timestamp);
      taskStartedTurnId = currentTurnId;
      if (openPair) pairs.push(openPair);
      openPair = { started: currentTurnId, complete: null };
    }
    if (row.type === 'event_msg' && payload.type === 'task_complete') {
      if (payload.turn_id !== currentTurnId) result.blocked = true;
      taskCompleteTurnId = textOrNull(payload.turn_id);
      turnOpen = false;
      if (openPair) pairs.push({ started: openPair.started, complete: taskCompleteTurnId });
      else pairs.push({ started: null, complete: taskCompleteTurnId });
      openPair = null;
    }
    if (row.type === 'turn_context') {
      if (typeof payload.cwd === 'string' && canonicalPath(payload.cwd) !== canonicalPath(scope.projectRoot)) throw new Error('scope_mismatch');
      if (payload.root_turn_id !== undefined && payload.root_turn_id !== payload.turn_id) result.blocked = true;
      if (payload.collaboration_mode !== undefined) { collaborationModePresent = true; result.blocked = true; }
      if (payload.multi_agent_version !== undefined) { multiAgentVersionPresent = true; result.blocked = true; }
      turnId = textOrNull(payload.turn_id);
      const rootTurnIdNonString = Object.hasOwn(payload, 'root_turn_id') && typeof payload.root_turn_id !== 'string';
      rootTurnId = rootTurnIdNonString ? null : Object.hasOwn(payload, 'root_turn_id') ? textOrNull(payload.root_turn_id) : null;
      turnContexts.push({
        turnId, rootTurnId, rootTurnIdNonString,
        collaborationModePresent: payload.collaboration_mode !== undefined,
        multiAgentVersionPresent: payload.multi_agent_version !== undefined,
      });
      if (!ModelSchema.safeParse(payload.model).success) throw new Error('unsupported');
      if (result.model && result.model !== payload.model) result.blocked = true;
      result.model = String(payload.model);
    }
    if (row.type === 'event_msg' && payload.type === 'token_count' && payload.info !== null) {
      const info = object(payload.info);
      const total = requiredVector(object(info.total_token_usage), candidate.requiredTotalFields);
      latestTotal = total;
      if (Object.hasOwn(info, 'last_token_usage')) latestLast = optionalVector(object(info.last_token_usage));
      if (total.input === null || total.cached === null || total.output === null || total.reasoning === null) throw new Error('unsupported');
      const counters = [total.input, total.cached, total.output, total.reasoning];
      if (result.counters && counters.some((value, index) => value < result.counters![index]!)) result.blocked = true;
      const previous = result.counters ?? [0, 0, 0, 0];
      if (!result.blocked && result.model && (!result.counters || counters.some((value, index) => value !== previous[index]))) {
        const deltas = counters.map((value, index) => value - (previous[index] ?? 0));
        const currentModel = result.model;
        if (!currentModel) throw new Error('unsupported');
        const key = metadataKey(scope.sessionId, 'usage', ...counters.map(String));
        const record: SourceRecord = {
          key, at: timestamp(row.timestamp), turnStartedAt,
          payload: usagePayload(scope, deltas, currentModel, 'sequential'),
        };
        const previousRecord = records.get(key);
        if (previousRecord && JSON.stringify(previousRecord) !== JSON.stringify(record)) throw new SourceFailure('record_conflict');
        records.set(key, record);
      }
      result.counters = counters; result.counterAt = timestamp(row.timestamp);
    }
  }
  if (openPair) pairs.push(openPair);
  if (!identified) throw new Error('scope_mismatch');
  result.records = [...records.values()];
  if (result.blocked) result.reasons.push('unsupported');
  return {
    ...result,
    vectors: { total: latestTotal, last: latestLast, exec: null, priorTotal: null },
    topology: {
      taskStartedTurnId, taskCompleteTurnId, turnId, rootTurnId,
      collaborationModePresent, multiAgentVersionPresent, threadSettingsApplied,
      sessionMetaId, sessionMetaSessionId, linkedSessionId: scope.sessionId,
      pairs, turnContexts,
    },
    traversal: traverseCatalog(parsedRows, admissionCatalog),
  };
}
