import { addTokens } from '../contracts.js';
import { parseComparison } from '../comparison-contracts.js';
import { ComparisonSnapshotInputSchema } from './comparison-contracts.js';
import type { ComparisonSnapshotInput, SnapshotAssignment } from './comparison-contracts.js';

const ms = Date.parse;
export const codePointOrder = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export function projectComparison(input: ComparisonSnapshotInput) {
  const data = parseComparison(ComparisonSnapshotInputSchema, input, 'invalid_snapshot_input');
  if (ms(data.cutoff) > ms(data.evaluated_at) || data.protocol.purpose !== 'synthetic_validation') throw new Error('invalid_snapshot_input');
  const protocol = data.protocol;
  const cohort = data.assignments.filter(row => ms(row.assigned_at) >= ms(protocol.recruitment_start) &&
    ms(row.assigned_at) < ms(protocol.recruitment_end) && ms(row.assigned_at) < ms(data.cutoff));
  const tasks = cohort.sort((a, b) => codePointOrder(a.task_id, b.task_id)).map(row => {
    const end = new Date(Math.min(ms(data.cutoff), ms(row.followup_ends_at))).toISOString();
    const inWindow = (at: string) => ms(at) >= ms(row.assigned_at) && ms(at) < ms(end);
    const started = row.started_at !== null && inWindow(row.started_at);
    const outcome = row.outcome && inWindow(row.outcome.assessed_at) ? row.outcome : null;
    const deadlineStatus = ms(data.cutoff) < ms(row.followup_ends_at) ? 'pending_followup' as const : outcome?.status ?? (started ? 'outcome_missing' as const : 'not_started' as const);
    const usages = row.usages.filter(event => inWindow(event.occurred_at) && (event.recorded_at === null || ms(event.recorded_at) <= ms(data.evaluated_at)));
    const reading = (field: 'input_total' | 'output_total' | 'cached_input' | 'reasoning_output') => {
      const counts = { observed: 0, missing: 0, error: 0, excluded: 0, unmeasurable: 0 };
      const reasons: Record<string, number> = {}; const values: number[] = [];
      for (const event of usages) {
        const item = event.payload[field]; counts[item.status]++;
        if (item.status === 'observed') values.push(item.value);
        else reasons[item.reason] = (reasons[item.reason] ?? 0) + 1;
      }
      return { observed_sum: values.length ? addTokens(values) : null, observed_events: values.length, status_counts: counts, reason_counts: reasons };
    };
    const inputTotal = reading('input_total'); const outputTotal = reading('output_total');
    const confirmations = row.confirmations.filter(record => inWindow(record.occurred_at) && ms(record.recorded_at) <= ms(data.evaluated_at));
    const known = [...new Set(confirmations.flatMap(record => record.actual_variant_id === null ? [] : [record.actual_variant_id]))].sort(codePointOrder);
    const category = known.length > 1 ? 'mixed' : known[0] === protocol.variant_ids[0] ? 'declared_a_only' :
      known[0] === protocol.variant_ids[1] ? 'declared_b_only' : known.length ? 'declared_other_only' : 'unknown';
    const clip = (interval: { started_at: string; ended_at: string | null }) => ({
      started_at: new Date(Math.max(ms(interval.started_at), ms(row.assigned_at))).toISOString(),
      ended_at: new Date(Math.min(ms(interval.ended_at ?? end), ms(end))).toISOString(),
    });
    const overlaps = (interval: { started_at: string; ended_at: string | null }) => ms(interval.started_at) < ms(end) && ms(interval.ended_at ?? end) > ms(row.assigned_at);
    const intervals = row.active_intervals.filter(overlaps).map(clip).sort((a, b) => codePointOrder(a.started_at, b.started_at));
    let activeMs = 0; let previousEnd = ms(row.assigned_at);
    for (const interval of intervals) { const a = Math.max(previousEnd, ms(interval.started_at)); const b = ms(interval.ended_at);
      if (b > a) { activeMs = addTokens([activeMs, b - a]); previousEnd = b; } }
    return { task_id: row.task_id, assignment_id: row.assignment_id, original_variant_id: row.variant_id,
      assigned_at: row.assigned_at, followup_ends_at: row.followup_ends_at, endpoint_end: end, stratum_id: row.stratum_id, block_id: row.block_id,
      metadata: row.metadata, environment_id: row.environment_id, started,
      first_completed_at: row.first_completed_at && inWindow(row.first_completed_at) ? row.first_completed_at : null,
      first_assessed_at: row.first_assessed_at && inWindow(row.first_assessed_at) ? row.first_assessed_at : null,
      first_success: row.first_assessed_at && inWindow(row.first_assessed_at) ? row.first_success : null,
      finalized_at: row.finalized_at && inWindow(row.finalized_at) ? row.finalized_at : null,
      deadline_status: deadlineStatus, current_outcome: outcome?.status ?? null, criteria_met: outcome?.criteria_met ?? [],
      rework_count: row.rework_starts.filter(inWindow).length,
      usage: { status: usages.length ? 'partial' as const : 'missing' as const, complete_tokens: null,
        partial_tokens: inputTotal.observed_sum !== null && outputTotal.observed_sum !== null ? addTokens([inputTotal.observed_sum, outputTotal.observed_sum]) : null,
        input_total: inputTotal, output_total: outputTotal, cached_input: reading('cached_input'), reasoning_output: reading('reasoning_output'),
        known_late_arrivals: usages.filter(event => event.recorded_at !== null && ms(event.recorded_at) >= ms(end)).length,
        legacy_receipt_unknown: usages.filter(event => event.recorded_at === null).length },
      actual_configuration: { category, known_variant_ids: known,
        has_unknown_variant: !confirmations.length || confirmations.some(record => record.actual_variant_id === null),
        has_unknown_runtime: !confirmations.length || confirmations.some(record => [record.product, record.product_version, record.model, record.reasoning_setting, record.environment_id].includes(null)),
        has_runtime_drift: confirmations.some(record => record.deviation_codes.includes('version_drift')),
        self_attested: confirmations.filter(record => record.evidence_method === 'self_attested').length,
        selected_artifact_hash: confirmations.filter(record => record.evidence_method === 'selected_artifact_hash').length },
      deviations: row.deviations.filter(record => inWindow(record.occurred_at) && ms(record.recorded_at) <= ms(data.evaluated_at)),
      observations: row.observations.filter(overlaps).map(interval => ({ ...clip(interval),
        status: interval.ended_at === null || ms(interval.ended_at) > ms(end) ? 'unmeasurable' : interval.status,
        reason: interval.ended_at === null || ms(interval.ended_at) > ms(end) ? 'incomplete' : interval.reason })),
      time: { active_ms: started ? activeMs : null, elapsed_ms: started ? ms(end) - ms(row.started_at!) : null, elapsed_is_labor: false },
    };
  });
  const rate = (numerator: number, denominator: number, reason: string | null = null) => ({ numerator, denominator, value: reason || !denominator ? null : numerator / denominator, reason: reason ?? (denominator ? null : 'empty_denominator') });
  const hasPendingFollowup = tasks.some(row => row.deadline_status === 'pending_followup');
  const distribution = (values: number[]) => {
    const sorted = values.sort((a, b) => a - b);
    return { task_denominator: sorted.length, distribution: sorted, mean: sorted.length ? addTokens(sorted) / sorted.length : null,
      median: !sorted.length ? null : sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)]! : sorted[sorted.length / 2 - 1]! / 2 + sorted[sorted.length / 2]! / 2 };
  };
  const summary = (rows: typeof tasks) => {
    const statuses = { success: 0, failed: 0, aborted: 0, not_started: 0, outcome_missing: 0, pending_followup: 0 };
    for (const row of rows) statuses[row.deadline_status]++;
    const partial = rows.flatMap(row => row.usage.partial_tokens === null ? [] : [row.usage.partial_tokens]).sort((a, b) => a - b);
    const first = rows.filter(row => row.first_success !== null);
    const assessed = rows.filter(row => row.current_outcome !== null);
    const criterionCount = addTokens(assessed.map(row => row.metadata.criterion_ids.length));
    const missing = rows.filter(row => row.usage.status === 'missing').length;
    return { assigned_tasks: rows.length, deadline_counts: statuses,
      deadline_success: rate(statuses.success, rows.length, hasPendingFollowup ? 'pending_followup' : null),
      usage: { complete_tasks: 0, partial_tasks: rows.length - missing, missing_tasks: missing,
        missing_rate: rate(missing, rows.length), complete_tokens_mean: null, cost: null, change_rate: null, tokens_per_success: null,
        partial_tokens: distribution(partial),
        partial_input_total: distribution(rows.flatMap(row => row.usage.input_total.observed_sum === null ? [] : [row.usage.input_total.observed_sum])),
        partial_output_total: distribution(rows.flatMap(row => row.usage.output_total.observed_sum === null ? [] : [row.usage.output_total.observed_sum])) },
      first_attempt: { assessed_tasks: first.length, unassessed_tasks: rows.length - first.length, success: rate(first.filter(row => row.first_success).length, first.length) },
      criteria: { assessed_tasks: assessed.length, unassessed_tasks: rows.length - assessed.length, fulfillment: rate(addTokens(assessed.map(row => row.criteria_met.length)), criterionCount) },
      rework: { task_rate: rate(rows.filter(row => row.rework_count > 0).length, rows.length), attempts: addTokens(rows.map(row => row.rework_count)) },
      outcome_missing_rate: rate(statuses.outcome_missing + statuses.not_started, rows.length),
    };
  };
  const dimensions = ['assignee', 'type', 'expected_size', 'expected_complexity', 'product', 'model', 'environment_id', 'assignment_day'] as const;
  const composition = dimensions.flatMap(dimension => {
    const groups = new Map<string, typeof tasks>();
    for (const task of tasks) { const value = dimension === 'environment_id' ? task.environment_id : dimension === 'assignment_day' ? task.assigned_at.slice(0, 10) : task.metadata[dimension] ?? 'unspecified';
      groups.set(value, [...(groups.get(value) ?? []), task]); }
    return [...groups].sort(([a], [b]) => codePointOrder(a, b)).map(([value, rows]) => ({ dimension, value, ...summary(rows) }));
  });
  const blocks = [...new Set(tasks.map(row => row.block_id))].sort(codePointOrder).map(blockId => {
    const rows = tasks.filter(row => row.block_id === blockId);
    return { block_id: blockId, stratum_id: rows[0]!.stratum_id, assigned_tasks: rows.length,
      a: rows.filter(row => row.original_variant_id === protocol.variant_ids[0]).length,
      b: rows.filter(row => row.original_variant_id === protocol.variant_ids[1]).length, planned_size: protocol.block_size,
      status: rows.length === protocol.block_size ? 'complete' : 'incomplete' };
  });
  const registrations = data.registrations.filter(row => ms(row.registered_at) >= ms(protocol.recruitment_start) && ms(row.registered_at) < Math.min(ms(data.cutoff), ms(protocol.recruitment_end)));
  const assignedRegistrations = registrations.filter(row => row.assignment_at !== null && ms(row.assignment_at) < ms(data.cutoff));
  return { schema_version: 1, descriptive_version: data.descriptive_version, report_id: data.report_id, mode: 'randomized_task', purpose: 'synthetic_validation',
    protocol_id: protocol.id, settings: protocol, variants: data.variants, cutoff: data.cutoff, evaluated_at: data.evaluated_at,
    data_revision: data.data_revision, snapshot_sequence: data.snapshot_sequence, revision_reason: data.revision_reason, supersedes_report_id: data.supersedes_report_id,
    validity_status: 'valid', provisional: ms(data.cutoff) < ms(protocol.recruitment_end) || tasks.some(row => row.deadline_status === 'pending_followup'),
    recruitment_context: { population: 'project_registration_activity', unassigned_eligibility: 'unknown', registered_tasks: registrations.length,
      assigned_this_protocol: assignedRegistrations.filter(row => row.assignment_protocol_id === protocol.id).length,
      assigned_other_protocol: assignedRegistrations.filter(row => row.assignment_protocol_id !== protocol.id).length, unassigned: registrations.length - assignedRegistrations.length },
    total: summary(tasks), arms: protocol.variant_ids.map(variantId => ({ original_variant_id: variantId, ...summary(tasks.filter(row => row.original_variant_id === variantId)) })),
    composition, blocks, tasks, actual_configuration_summary: ['declared_a_only', 'declared_b_only', 'declared_other_only', 'mixed', 'unknown'].map(category => ({
      category, population: 'supplementary_declared_history', ...summary(tasks.filter(row => row.actual_configuration.category === category)) })),
    adoption: { status: 'inconclusive', reason: 'analysis_not_validated' }, confidence_interval: null, p_value: null,
    limitations: ['partial_usage_is_not_a_task_total', 'no_complete_cost_or_savings', 'no_causal_or_adoption_conclusion', 'current_evaluation_not_historical_knowledge', 'elapsed_is_not_human_labor', 'declared_configuration_does_not_prove_isolation'],
  };
}
export type ComparisonReport = ReturnType<typeof projectComparison> & { snapshot_hash: string };
// Keep the stored contract independent of current DB state.
export type { SnapshotAssignment };
