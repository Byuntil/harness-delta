import { multiAgentAllowed, type CollaborationMode, type MultiAgentVersion } from '../../src/codex-rollout-policy.js';
export interface CounterVector {
  readonly input: number | null;
  readonly cached: number | null;
  readonly output: number | null;
  readonly reasoning: number | null;
  readonly cacheWrite: number | null;
  readonly totalTokens: number | null;
}

export const checkNames = [
  'total_equals_input_plus_output',
  'last_equals_input_plus_output',
  'exec_equals_rollout_total',
  'resume_total_equals_prior_plus_last',
  'cached_subset_of_input',
  'cache_write_subset_of_input',
  'cache_write_not_added_to_input',
  'reasoning_subset_of_output',
  'nonzero_reasoning',
  'paired_turn_ids',
  'root_turn_topology',
  'thread_settings_applied',
  'session_id_matches_id',
  'collaboration_mode_allowed',
  'multi_agent_version_allowed',
  'no_child_activity',
] as const;

export type CheckName = typeof checkNames[number];
export type CheckOutcome = 'pass' | 'fail' | 'not_observed' | 'invalid';
export type CheckMap = Record<CheckName, CheckOutcome>;

const vectorFields = ['input', 'cached', 'output', 'reasoning', 'cacheWrite', 'totalTokens'] as const;

function blank(): CheckMap {
  return Object.fromEntries(checkNames.map(name => [name, 'not_observed'])) as CheckMap;
}

function safe(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}

function subset(part: number | null, whole: number | null, parent: CounterVector | null): CheckOutcome {
  if (parent === null) return 'not_observed';
  if (!safe(part) || !safe(whole)) return 'invalid';
  return part <= whole ? 'pass' : 'fail';
}

function tokenEquality(vector: CounterVector | null): CheckOutcome {
  if (vector === null || vector.totalTokens === null) return 'not_observed';
  if (!safe(vector.input) || !safe(vector.output) || !safe(vector.totalTokens)) return 'invalid';
  if (vector.input > Number.MAX_SAFE_INTEGER - vector.output) return 'invalid';
  return vector.totalTokens === vector.input + vector.output ? 'pass' : 'fail';
}

const execCoreFields = ['input', 'cached', 'output', 'reasoning'] as const;

/** Exec usage omits `total_tokens` and may omit cache-write; compare what it reports. */
function execMatchesTotal(exec: CounterVector | null, total: CounterVector | null): CheckOutcome {
  if (exec === null || total === null) return 'not_observed';
  for (const field of execCoreFields) if (!safe(exec[field])) return 'invalid';
  for (const field of vectorFields) {
    const reported = exec[field];
    if (reported === null) continue;
    const recorded = total[field];
    if (recorded === null) return 'fail';
    if (!safe(reported) || !safe(recorded)) return 'invalid';
    if (reported !== recorded) return 'fail';
  }
  return 'pass';
}

function resumed(total: CounterVector | null, prior: CounterVector | null, last: CounterVector | null): CheckOutcome {
  if (total === null || prior === null || last === null) return 'not_observed';
  for (const field of ['input', 'output'] as const) {
    const current = total[field];
    const before = prior[field];
    const added = last[field];
    if (!safe(current) || !safe(before) || !safe(added)) return 'invalid';
    if (before > Number.MAX_SAFE_INTEGER - added) return 'invalid';
    if (current !== before + added) return 'fail';
  }
  return 'pass';
}

export function classifyCounters(input: {
  total: CounterVector | null;
  last: CounterVector | null;
  exec: CounterVector | null;
  priorTotal: CounterVector | null;
  inputIncludesCacheWrite: boolean;
}): CheckMap {
  const checks = blank();
  checks.total_equals_input_plus_output = tokenEquality(input.total);
  checks.last_equals_input_plus_output = tokenEquality(input.last);
  checks.exec_equals_rollout_total = execMatchesTotal(input.exec, input.total);
  checks.resume_total_equals_prior_plus_last = resumed(input.total, input.priorTotal, input.last);
  checks.cached_subset_of_input = subset(input.total?.cached ?? null, input.total?.input ?? null, input.total);
  checks.cache_write_subset_of_input = subset(input.total?.cacheWrite ?? null, input.total?.input ?? null, input.total);
  checks.cache_write_not_added_to_input = input.inputIncludesCacheWrite ? 'fail' : 'pass';
  checks.reasoning_subset_of_output = subset(input.total?.reasoning ?? null, input.total?.output ?? null, input.total);
  const reasoning = input.total?.reasoning ?? null;
  checks.nonzero_reasoning = input.total === null || reasoning === null ? 'not_observed'
    : !safe(reasoning) ? 'invalid'
    : reasoning === 0 ? 'not_observed'
    : 'pass';
  return checks;
}

export function classifyTopology(input: {
  taskStartedTurnId: string | null;
  taskCompleteTurnId: string | null;
  turnId: string | null;
  rootTurnId: string | null;
  collaborationModePresent: boolean;
  multiAgentVersionPresent: boolean;
  threadSettingsApplied: 'absent' | 'same_thread' | 'ambiguous';
  sessionMetaId: string | null;
  sessionMetaSessionId: string | null;
  linkedSessionId: string | null;
}): Pick<CheckMap, 'paired_turn_ids' | 'root_turn_topology' | 'thread_settings_applied' | 'session_id_matches_id'> {
  const started = input.taskStartedTurnId;
  const complete = input.taskCompleteTurnId;
  const paired = started === null && complete === null ? 'not_observed'
    : started === null || complete === null ? 'fail'
    : !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(started) || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(complete) ? 'invalid'
    : started === complete ? 'pass' : 'fail';
  const root = input.rootTurnId === null ? 'not_observed'
    : input.turnId === null || input.rootTurnId !== input.turnId ? 'fail' : 'pass';
  const settings = input.threadSettingsApplied === 'absent' ? 'not_observed' : input.threadSettingsApplied === 'same_thread' ? 'pass' : 'fail';
  const session = input.sessionMetaSessionId === null ? 'not_observed'
    : input.sessionMetaId === null || input.linkedSessionId === null ? 'fail'
    : input.sessionMetaId === '' || input.sessionMetaSessionId === '' || input.linkedSessionId === '' ? 'invalid'
    : input.sessionMetaId === input.sessionMetaSessionId && input.sessionMetaId === input.linkedSessionId ? 'pass' : 'fail';
  return {
    paired_turn_ids: paired,
    root_turn_topology: root,
    thread_settings_applied: settings,
    session_id_matches_id: session,
  };
}

const outcomeRank: Record<CheckOutcome, number> = { not_observed: 0, pass: 1, fail: 2, invalid: 3 };

export function foldCheck(current: CheckOutcome, next: CheckOutcome): CheckOutcome {
  return outcomeRank[next] > outcomeRank[current] ? next : current;
}

const turnIdPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;

export interface TurnPair { readonly started: string | null; readonly complete: string | null }
export interface TurnContextFact {
  readonly turnId: string | null;
  readonly rootTurnId: string | null;
  /** True when `root_turn_id` is present and not a string. Distinct from an absent root. */
  readonly rootTurnIdNonString: boolean;
  readonly collaborationModePresent: boolean;
  readonly multiAgentVersionPresent: boolean;
}

function pairOutcome(pair: TurnPair): CheckOutcome {
  if (pair.started === null && pair.complete === null) return 'not_observed';
  if (pair.started === null || pair.complete === null) return 'fail';
  if (!turnIdPattern.test(pair.started) || !turnIdPattern.test(pair.complete)) return 'invalid';
  return pair.started === pair.complete ? 'pass' : 'fail';
}

function contextOutcome(context: TurnContextFact): CheckOutcome {
  if (context.rootTurnIdNonString) return 'invalid';
  if (context.rootTurnId === null) return 'not_observed';
  if (context.turnId === null) return 'fail';
  if (!turnIdPattern.test(context.turnId) || !turnIdPattern.test(context.rootTurnId)) return 'invalid';
  return context.rootTurnId === context.turnId ? 'pass' : 'fail';
}

export function classifySessionTopology(input: {
  pairs: readonly TurnPair[];
  collaborationModes: readonly CollaborationMode[];
  multiAgentVersions: readonly MultiAgentVersion[];
  childActivity: boolean;
  turnContexts: readonly TurnContextFact[];
  collaborationModePresent: boolean;
  multiAgentVersionPresent: boolean;
  threadSettingsApplied: 'absent' | 'same_thread' | 'ambiguous';
  sessionMetaId: string | null;
  sessionMetaSessionId: string | null;
  linkedSessionId: string | null;
  taskStartedTurnId: string | null;
  taskCompleteTurnId: string | null;
  turnId: string | null;
  rootTurnId: string | null;
}): Pick<CheckMap, 'paired_turn_ids' | 'root_turn_topology' | 'thread_settings_applied' | 'session_id_matches_id' | 'collaboration_mode_allowed' | 'multi_agent_version_allowed' | 'no_child_activity'> {
  const single = classifyTopology(input);
  const paired = input.pairs.reduce<CheckOutcome>((current, pair) => foldCheck(current, pairOutcome(pair)), 'not_observed');
  const root = input.turnContexts.reduce<CheckOutcome>((current, context) => foldCheck(current, contextOutcome(context)), 'not_observed');
  return {
    collaboration_mode_allowed: input.collaborationModes.length === 0 ? 'not_observed' : input.collaborationModes.every(mode => mode === 'default' || mode === 'plan') ? 'pass' : 'fail',
    multi_agent_version_allowed: input.multiAgentVersions.length === 0 ? 'not_observed' : input.multiAgentVersions.every(multiAgentAllowed) ? 'pass' : 'fail',
    no_child_activity: input.childActivity ? 'fail' : 'pass',
    paired_turn_ids: input.pairs.length === 0 ? single.paired_turn_ids : paired,
    root_turn_topology: root,
    thread_settings_applied: single.thread_settings_applied,
    session_id_matches_id: single.session_id_matches_id,
  };
}
