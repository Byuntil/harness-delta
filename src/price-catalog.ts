import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { IdSchema, ModelSchema, MonetaryAmountSchema, TimestampSchema } from './contracts.js';
import { PriceTableSchema, type BillingComponent, type PriceTable, type UsageEvent, type RuntimeEvidence } from './flexible-contracts.js';
import { verifiedRequestPromptTokens } from './request-price-evidence.js';
import { canonicalJson } from './reports/comparison-snapshot.js';

export const referencePolicyId = 'reference-standard-v1';
export const catalogMatchingVersion = 'exact-catalog-v1';
export const requestTierPolicyId = 'reference-standard-request-tiers-v2';
export const requestTierMatchingVersion = 'exact-catalog-request-tiers-v2';
export const catalogByteLimit = 1024 * 1024;
const rate = MonetaryAmountSchema.refine(value => value.replace('.', '').length <= 60);
const ratesSchema = z.strictObject({ ordinary_input: rate.optional(), cache_read: rate.optional(), cache_write: rate.optional(), output: rate.optional() });
const fullRatesSchema = z.strictObject({ ordinary_input: rate, cache_read: rate, cache_write: rate, output: rate });
const modelSchema = z.strictObject({
  product: z.enum(['codex', 'claude_code']), provider_id: z.enum(['openai', 'anthropic']), model: ModelSchema,
  aliases: z.array(ModelSchema).max(16), rates: ratesSchema,
  prompt_tiers: z.strictObject({ up_to_100000: fullRatesSchema, over_100000: fullRatesSchema }).optional(), source_url: z.string().url(),
  verified_at: TimestampSchema, effective_from: TimestampSchema.nullable(), effective_until: TimestampSchema.nullable(),
}).refine(row => row.prompt_tiers === undefined || row.model === 'claude-haiku-5-5' && row.provider_id === 'anthropic' && row.aliases.length === 0 && Object.keys(row.rates).length === 0)
  .refine(row => row.product === (row.provider_id === 'openai' ? 'codex' : 'claude_code'))
  .refine(row => row.source_url === (row.provider_id === 'openai' ? 'https://developers.openai.com/api/docs/pricing' : 'https://platform.claude.com/docs/en/about-claude/pricing'))
  .refine(row => row.effective_from === null || row.effective_until === null || Date.parse(row.effective_from) < Date.parse(row.effective_until));
export const PriceCatalogSchema = z.strictObject({
  schema_version: z.union([z.literal(1), z.literal(2)]), catalog_id: IdSchema, catalog_version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  published_at: TimestampSchema, verified_at: TimestampSchema, currency: z.literal('USD'), unit_tokens: z.literal(1000000),
  policy_id: z.enum([referencePolicyId, requestTierPolicyId]), models: z.array(modelSchema).min(1).max(256),
}).superRefine((catalog, context) => {
  if ((catalog.schema_version === 1) !== (catalog.policy_id === referencePolicyId)) context.addIssue({ code: 'custom', message: 'invalid_catalog_policy' });
  if (catalog.schema_version === 1 && catalog.models.some(row => row.prompt_tiers !== undefined)) context.addIssue({ code: 'custom', message: 'invalid_catalog_policy' });
  if (catalog.models.some(row => row.model === 'claude-haiku-5-5' && (Object.keys(row.rates).length > 0 || catalog.schema_version === 2 && row.prompt_tiers === undefined))) context.addIssue({ code: 'custom', message: 'invalid_haiku_request_prices' });
  if(Date.parse(catalog.verified_at)>Date.parse(catalog.published_at))context.addIssue({code:'custom',message:'invalid_verification_date'});
  const keys = new Set<string>(); let entries = 0;
  for (const row of catalog.models) {
    if (Date.parse(row.verified_at) > Date.parse(catalog.verified_at) || Date.parse(row.verified_at) > Date.parse(catalog.published_at)) context.addIssue({ code: 'custom', message: 'invalid_verification_date' });
    for (const literal of [row.model, ...row.aliases]) {
      const key = `${row.product}:${literal}`;
      if (keys.has(key)) context.addIssue({ code: 'custom', message: 'ambiguous_catalog_alias' });
      keys.add(key); entries += Object.keys(row.rates).length + (row.prompt_tiers ? 8 : 0);
    }
  }
  if (entries > 4096) context.addIssue({ code: 'custom', message: 'catalog_too_large' });
});
export type PriceCatalog = z.infer<typeof PriceCatalogSchema>;
export interface PriceBasis {
  table: PriceTable; catalog: PriceCatalog; catalog_hash: string; policy_id: typeof referencePolicyId | typeof requestTierPolicyId;
  matching_version: typeof catalogMatchingVersion | typeof requestTierMatchingVersion; basis_hash: string;
  conditions: { openai: 'standard_short'; anthropic: 'standard_global_cache_write_5m' | 'standard_global_request_tiers_cache_write_5m' };
}
export function digest(value: string | Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
export function parsePriceCatalog(input: unknown): PriceCatalog {
  const parsed = PriceCatalogSchema.safeParse(input);
  if (!parsed.success) throw new Error('invalid_price_catalog');
  return { ...parsed.data, models: parsed.data.models.map(row => ({ ...row, aliases: [...row.aliases].sort() })).sort((a, b) => `${a.product}:${a.model}` < `${b.product}:${b.model}` ? -1 : 1) };
}
export function bundledCatalogBytes(): Buffer {
  const built = new URL('./catalogs/reference-catalog-2026-10-06.json', import.meta.url);
  return readFileSync(existsSync(built) ? built : new URL('../config/prices/catalogs/reference-catalog-2026-10-06.json', import.meta.url));
}
export function bundledPriceCatalog(): PriceCatalog {
  return parsePriceCatalog(JSON.parse(bundledCatalogBytes().toString('utf8')) as unknown);
}
export function compilePriceBasis(input: PriceCatalog, preparedAt = input.verified_at): PriceBasis {
  const catalog = parsePriceCatalog(input); TimestampSchema.parse(preparedAt);
  const entries: PriceTable['entries'] = [];
  for (const row of catalog.models) {
    if (row.effective_from !== null && Date.parse(preparedAt) < Date.parse(row.effective_from) || row.effective_until !== null && Date.parse(preparedAt) >= Date.parse(row.effective_until)) continue;
    for (const model of [row.model, ...row.aliases].sort()) for (const component of ['ordinary_input', 'cache_read', 'cache_write', 'output'] as const) {
      if (row.prompt_tiers) {
        for (const tier of ['up_to_100000', 'over_100000'] as const) entries.push({ product: row.product, model, component, price_per_unit: row.prompt_tiers[tier][component], prompt_tier: tier });
      } else {
        const price = row.rates[component];
        if (price !== undefined) entries.push({ product: row.product, model, component, price_per_unit: price });
      }
    }
  }
  if (!entries.length) throw new Error('catalog_no_current_rates');
  const catalogHash = digest(canonicalJson(catalog));
  const matchingVersion = catalog.schema_version === 1 ? catalogMatchingVersion : requestTierMatchingVersion;
  const body = { catalog_hash: catalogHash, policy_id: catalog.policy_id, matching_version: matchingVersion, entries };
  const hash = digest(canonicalJson(body));
  const table = PriceTableSchema.parse({ id: `catalog-prices-${hash}`, version: `catalog-v${catalog.catalog_version}`, currency: catalog.currency,
    source_id: catalog.catalog_id, as_of: catalog.verified_at, unit_tokens: catalog.unit_tokens, display_decimals: 6, rounding: 'half_even', entries });
  return { table, catalog, catalog_hash: catalogHash, policy_id: catalog.policy_id, matching_version: matchingVersion,
    basis_hash: hash, conditions: { openai: 'standard_short', anthropic: catalog.schema_version === 1 ? 'standard_global_cache_write_5m' : 'standard_global_request_tiers_cache_write_5m' } };
}
export type MatchReason = 'unknown_model' | 'unknown_provider' | 'unsupported_provider' | 'unknown_attribution' | 'missing_rate' | 'unverified_condition';
export interface MatchContext { providerId?: string; referenceBinding?: boolean; runtimeEvidence?: readonly RuntimeEvidence[] }
export function matchCatalogComponent(event: UsageEvent, component: BillingComponent['kind'], basis: PriceBasis, context: MatchContext = { referenceBinding: true }) {
  const usage = event.payload;
  const provider = context.providerId ?? (context.referenceBinding ? usage.product === 'codex' ? 'openai' : usage.product === 'claude_code' ? 'anthropic' : null : null);
  const row = basis.catalog.models.find(model => model.product === usage.product && (model.model === usage.model || model.aliases.includes(usage.model ?? '')));
  let reason: MatchReason | null = provider === null ? 'unknown_provider' : usage.model === null || !row ? 'unknown_model'
    : provider !== row.provider_id ? 'unsupported_provider' : 'schema_version' in usage && usage.attribution !== 'verified' ? 'unknown_attribution' : null;
  const promptTokens = row?.prompt_tiers ? verifiedRequestPromptTokens(event, context.runtimeEvidence ?? []) : null;
  if (!reason && row?.prompt_tiers && promptTokens === null) reason = 'unverified_condition';
  if (!reason && component === 'cache_write' && 'cache_write_1h_observed' in usage && usage.cache_write_1h_observed) reason = 'unverified_condition';
  const tier = promptTokens === null ? null : promptTokens <= 100000 ? 'up_to_100000' : 'over_100000';
  const price = row?.prompt_tiers && tier !== null ? row.prompt_tiers[tier][component] : row?.rates[component];
  if (!reason && price === undefined) reason = 'missing_rate';
  if (!reason && !basis.table.entries.some(entry => entry.product === usage.product && entry.model === usage.model && entry.component === component && entry.prompt_tier === (row?.prompt_tiers ? tier : undefined))) reason = 'unverified_condition';
  return { event_id: event.id, observed_model: usage.model, canonical_model: row?.model ?? null, component,
    provider_id: provider, provider_basis: context.providerId ? 'verified' : provider !== null ? 'reference_policy' : 'unknown',
    status: reason === null ? 'matched' : 'unavailable', price_per_unit: reason === null ? price! : null,
    source_url: row?.source_url ?? null, reason, ...(row?.prompt_tiers ? { prompt_tokens: promptTokens, prompt_tier: tier } : {}) };
}
