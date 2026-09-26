import { z } from 'zod';

export const IdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/);
export const TimestampSchema = z.iso.datetime({ offset: false });
export const MonetaryAmountSchema = z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/);
export const TokenSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const ReasonSchema = z.enum(['not_available', 'unsupported', 'source_error', 'paused',
  'offline', 'counter_reset', 'scope_mismatch', 'unknown_parent', 'incomplete', 'overflow']);
export const ReadingSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('observed'), value: TokenSchema, reason: z.null() }),
  ...(['missing', 'error', 'excluded', 'unmeasurable'] as const).map(status =>
    z.strictObject({ status: z.literal(status), value: z.null(), reason: ReasonSchema })),
]);
export type Reading = z.infer<typeof ReadingSchema>;
export const ComparisonModeSchema = z.enum(['randomized_task', 'observational_period']);
export const ModelSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
export const ProductVersionSchema = z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/);
export const UsageSchema = z.strictObject({
  kind: z.literal('usage'),
  input_total: ReadingSchema, cached_input: ReadingSchema,
  output_total: ReadingSchema, reasoning_output: ReadingSchema,
  product: z.enum(['codex', 'claude_code', 'synthetic']),
  product_version: ProductVersionSchema, model: ModelSchema, epoch: IdSchema,
});
export const EventSchema = z.strictObject({
  id: IdSchema, project_id: IdSchema, task_id: IdSchema, session_id: IdSchema,
  source_key: IdSchema, occurred_at: TimestampSchema,
  payload: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('session_linked') }), UsageSchema,
  ]),
});
export type Event = z.infer<typeof EventSchema>;

export function addTokens(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (!TokenSchema.safeParse(value).success || !Number.isSafeInteger(total + value)) {
      throw new Error('token_overflow');
    }
    total += value;
  }
  return total;
}

export const TaskMetadataSchema = z.strictObject({
  type: IdSchema, expected_size: IdSchema, assignee: IdSchema,
  product: z.enum(['codex', 'claude_code', 'synthetic']), model: ModelSchema,
  criterion_ids: z.array(IdSchema).min(1).refine(ids => new Set(ids).size === ids.length),
  expected_complexity: IdSchema.optional(),
});
export const SharedTaskSchema = TaskMetadataSchema.extend({ id: IdSchema, project_id: IdSchema });
export const SharedOutcomeSchema = z.strictObject({
  task_id: IdSchema, status: z.enum(['success', 'failed', 'aborted']),
  criteria_met: z.array(IdSchema).refine(ids => new Set(ids).size === ids.length),
  first_success: z.boolean().nullable(), assessed_at: TimestampSchema,
});
