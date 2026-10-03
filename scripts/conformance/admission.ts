import type { ConformanceCandidate } from './candidate.js';
import type { CheckName } from './checks.js';

export interface EvidenceIdentity {
  readonly policyRevision: string;
  readonly implementationDigest: string;
  readonly sourceRef: string;
  readonly previousVersion: string;
}
export const requiredChecks: readonly CheckName[] = [
  'total_equals_input_plus_output', 'last_equals_input_plus_output', 'exec_equals_rollout_total',
  'cached_subset_of_input', 'cache_write_subset_of_input', 'cache_write_not_added_to_input',
  'reasoning_subset_of_output', 'paired_turn_ids', 'root_turn_topology',
  'collaboration_mode_allowed', 'multi_agent_version_allowed', 'no_child_activity',
];
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Pure gate. It never trusts a TypeScript cast of an on-disk report, and never echoes its values. */
export function assessAdmission(candidate: ConformanceCandidate, value: unknown, identity: EvidenceIdentity): {
  eligible: boolean; reasons: string[]; optional: string[];
} {
  const report = object(value);
  const reasons: string[] = [];
  for (const key of ['policyRevision', 'implementationDigest', 'sourceRef', 'previousVersion'] as const) {
    if (report[key] !== identity[key]) reasons.push(`stale_${key}`);
  }
  if (identity.sourceRef !== candidate.sourceRef || identity.previousVersion !== candidate.previousVersion) reasons.push('candidate_identity_mismatch');
  if (report.version !== candidate.version || report.scenario !== 'exec_initial_resume') reasons.push('candidate_mismatch');
  if (report.confirmed !== true || report.stop !== null || report.productVersionBefore !== 'match' ||
      report.productVersionAfter !== 'match' || report.configMetadataUnchanged !== true) reasons.push('live_run_incomplete');
  const stages = Array.isArray(report.stages) ? report.stages : [];
  if (stages.length !== 2) reasons.push('two_stages_required');
  for (const [index, name] of ['initial', 'resume'].entries()) {
    const stage = object(stages[index]);
    const conformance = object(stage.conformance);
    const checks = object(conformance.checks);
    if (stage.stage !== name || stage.exit !== 'ok' || stage.rolloutMatch !== 'match' || stage.parseError !== null ||
        (name === 'resume' && stage.sameRolloutAsInitial !== true)) reasons.push(`${name}:linkage_or_exit`);
    if (conformance.version !== candidate.version || conformance.blocked !== false || conformance.limitExceeded !== false) reasons.push(`${name}:inspection_incomplete`);
    const required = name === 'resume' ? [...requiredChecks, 'resume_total_equals_prior_plus_last', 'thread_settings_applied'] : requiredChecks;
    for (const check of required) {
      if (checks[check] !== 'pass') {
        const outcome = checks[check];
        const safe = outcome === 'fail' || outcome === 'not_observed' || outcome === 'invalid' ? outcome : 'missing';
        reasons.push(`${name}:${check}:${safe}`);
      }
    }
    // Optional absence is allowed; an observed contradiction is not.
    for (const check of ['session_id_matches_id', 'thread_settings_applied']) {
      if (checks[check] === 'fail' || checks[check] === 'invalid') reasons.push(`${name}:${check}:conflict`);
    }
  }
  return { eligible: reasons.length === 0, reasons, optional: [
    'complete_tokens_unavailable', 'nonzero_reasoning_unverified', 'nonzero_cache_write_unverified',
    'warmup_requests_unobserved', 'interactive_linkage_unsupported', 'command_diagnostics_excluded', 'child_usage_excluded',
  ] };
}
