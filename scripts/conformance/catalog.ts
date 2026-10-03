export const admissionCatalog = [
  'session_meta.id',
  'session_meta.session_id',
  'session_meta.cli_version',
  'session_meta.cwd',
  'session_meta.source',
  'session_meta.creator_account_id',
  'session_meta.creator_user_id',
  'event_msg.task_started.turn_id',
  'event_msg.task_started.root_turn_id',
  'event_msg.task_complete.turn_id',
  'event_msg.thread_settings_applied',
  'event_msg.token_count.total_token_usage.input_tokens',
  'event_msg.token_count.total_token_usage.cached_input_tokens',
  'event_msg.token_count.total_token_usage.output_tokens',
  'event_msg.token_count.total_token_usage.reasoning_output_tokens',
  'event_msg.token_count.total_token_usage.cache_write_input_tokens',
  'event_msg.token_count.total_token_usage.total_tokens',
  'event_msg.token_count.last_token_usage.input_tokens',
  'event_msg.token_count.last_token_usage.cached_input_tokens',
  'event_msg.token_count.last_token_usage.output_tokens',
  'event_msg.token_count.last_token_usage.reasoning_output_tokens',
  'event_msg.token_count.last_token_usage.cache_write_input_tokens',
  'event_msg.token_count.last_token_usage.total_tokens',
  'turn_context.turn_id',
  'turn_context.root_turn_id',
  'turn_context.collaboration_mode',
  'turn_context.collaboration_mode.mode',
  'event_msg.thread_settings_applied.thread_id',
  'event_msg.thread_settings_applied.thread_settings.cwd',
  'event_msg.item_completed.item.type',
  'event_msg.sub_agent_activity',
  'turn_context.multi_agent_version',
  'turn_context.model',
  'token_usage_record',
] as const;

export type CatalogPath = typeof admissionCatalog[number];

const recordTypes = new Set(['session_meta', 'event_msg', 'turn_context', 'token_usage_record', 'response_item', 'world_state', 'compacted']);
const eventTypes = new Set(['task_started', 'task_complete', 'thread_settings_applied', 'token_count', 'item_completed', 'sub_agent_activity']);

export interface CatalogTraversal {
  readonly matchedPaths: readonly string[];
  readonly unknownNameCount: number;
  readonly recordCounts: Readonly<Record<string, number>>;
  readonly eventCounts: Readonly<Record<string, number>>;
  readonly limitExceeded: boolean;
}

interface WalkState {
  matchedPaths: string[];
  unknownNameCount: number;
  recordCounts: Record<string, number>;
  eventCounts: Record<string, number>;
  limitExceeded: boolean;
  nodes: number;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function traverseCatalog(
  value: unknown,
  catalog: readonly string[],
  limits: { maxDepth?: number; maxNodes?: number; maxNodesPerRow?: number } = {},
): CatalogTraversal {
  const bounds = { maxDepth: 8, maxNodes: 20000, maxNodesPerRow: 128, ...limits };
  const names = new Set(catalog);
  const state: WalkState = {
    matchedPaths: [], unknownNameCount: 0, recordCounts: {}, eventCounts: {}, limitExceeded: false, nodes: 0,
  };
  let rowNodes = 0;
  const note = (path: string): boolean => {
    if (state.limitExceeded || state.nodes >= bounds.maxNodes || rowNodes >= bounds.maxNodesPerRow) {
      state.limitExceeded = true;
      return false;
    }
    state.nodes += 1;
    rowNodes += 1;
    if (names.has(path)) state.matchedPaths.push(path);
    else state.unknownNameCount += 1;
    return true;
  };
  const count = (bucket: Record<string, number>, key: string) => { bucket[key] = (bucket[key] ?? 0) + 1; };
  const walkValue = (current: unknown, path: string, depth: number) => {
    if (depth > bounds.maxDepth) { state.limitExceeded = true; return; }
    if (!note(path)) return;
    if (current !== null && typeof current === 'object' && !Array.isArray(current)) {
      const record = objectValue(current);
      for (const key of Object.keys(record)) walkValue(record[key], `${path}.${key}`, depth + 1);
    }
  };
  const walkRow = (row: Record<string, unknown>) => {
    rowNodes = 0;
    const type = typeof row.type === 'string' ? row.type : '';
    if (!recordTypes.has(type)) { state.unknownNameCount += 1; return; }
    count(state.recordCounts, type);
    const payload = objectValue(row.payload);
    if (type === 'token_usage_record') {
      if (names.has(type)) state.matchedPaths.push(type);
      for (const key of Object.keys(payload)) walkValue(payload[key], `${type}.${key}`, 1);
      return;
    }
    if (type === 'turn_context' && Object.hasOwn(objectValue(payload.collaboration_mode), 'mode')) note('turn_context.collaboration_mode.mode');
    if (type === 'session_meta' || type === 'turn_context') {
      for (const key of Object.keys(payload)) {
        if (state.limitExceeded) return;
        if (!note(`${type}.${key}`)) return;
      }
      return;
    }
    if (type === 'event_msg') {
      const event = typeof payload.type === 'string' ? payload.type : '';
      if (!eventTypes.has(event)) { state.unknownNameCount += 1; return; }
      count(state.eventCounts, event);
      if (event === 'thread_settings_applied') {
        note(`event_msg.${event}`);
        if (Object.hasOwn(payload, 'thread_id')) note(`event_msg.${event}.thread_id`);
        if (Object.hasOwn(objectValue(payload.thread_settings), 'cwd')) note(`event_msg.${event}.thread_settings.cwd`);
      }
      if (event === 'item_completed' && Object.hasOwn(objectValue(payload.item), 'type')) note('event_msg.item_completed.item.type');
      if (event === 'sub_agent_activity') note('event_msg.sub_agent_activity');
      if (event === 'task_started' || event === 'task_complete') {
        if (Object.hasOwn(payload, 'turn_id')) note(`event_msg.${event}.turn_id`);
        if (event === 'task_started' && Object.hasOwn(payload, 'root_turn_id')) note('event_msg.task_started.root_turn_id');
      }
      if (event === 'token_count') {
        const info = objectValue(payload.info);
        for (const surface of ['total_token_usage', 'last_token_usage']) {
          for (const key of Object.keys(objectValue(info[surface]))) {
            if (state.limitExceeded) return;
            note(`event_msg.token_count.${surface}.${key}`);
          }
        }
      }
    }
  };
  const rows = Array.isArray(value) ? value : [value];
  for (const row of rows) {
    if (state.limitExceeded) break;
    if (row !== null && typeof row === 'object' && !Array.isArray(row)) walkRow(row as Record<string, unknown>);
    else state.unknownNameCount += 1;
  }
  return {
    matchedPaths: state.matchedPaths, unknownNameCount: state.unknownNameCount,
    recordCounts: state.recordCounts, eventCounts: state.eventCounts, limitExceeded: state.limitExceeded,
  };
}
