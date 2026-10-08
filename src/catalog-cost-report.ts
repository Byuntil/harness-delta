import { EventSchema } from './contracts.js';
import type { BillingComponent, UsageEvent } from './flexible-contracts.js';
import { projectObservedCost } from './observed-cost-report.js';
import { matchCatalogComponent, type MatchContext, type PriceBasis } from './price-catalog.js';
import { priceUsage, sumAmounts, type LegacyInputBasis } from './pricing.js';

/** Pure metadata projection. Provider bindings are an explicit reference policy, not billing evidence. */
export function projectCatalogCost(events: readonly UsageEvent[], basis: PriceBasis, taskId: string, cutoff: string, inputBasis: LegacyInputBasis,
  context: MatchContext = { referenceBinding: true }) {
  const report = projectObservedCost(events, basis.table, taskId, cutoff, inputBasis, context.runtimeEvidence);
  const unique = new Map<string, UsageEvent>();
  for (const raw of events) {
    const event = EventSchema.parse(raw) as UsageEvent;
    if (Date.parse(event.occurred_at) < Date.parse(cutoff) && !unique.has(event.source_key)) unique.set(event.source_key,event);
  }
  const rows = [...unique.values()].sort((a,b) => a.source_key < b.source_key ? -1 : a.source_key > b.source_key ? 1 : 0);
  const matches: ReturnType<typeof matchCatalogComponent>[] = [];
  const amounts: string[] = []; const reasons = new Set(report.reasons);
  let unavailableEvents = 0;
  for (const event of rows) {
    const usage = event.payload;
    const kinds: BillingComponent['kind'][] = 'schema_version' in usage ? usage.billing_components.map(component => component.kind) : ['output'];
    if (!('schema_version' in usage) && inputBasis === 'cache-read-remainder-ordinary-v1' && usage.input_total.status === 'observed' && usage.cached_input.status === 'observed') kinds.push('ordinary_input','cache_read');
    const eventMatches = kinds.map(kind => matchCatalogComponent(event,kind,basis,context)); matches.push(...eventMatches);
    const accepted = new Set(eventMatches.filter(match => match.status === 'matched').map(match => match.component));
    if (!accepted.size) { unavailableEvents++; reasons.add('unpriced_component'); continue; }
    // A transient rate view prevents rejected matches entering arithmetic. It is never registered
    // or serialized as a replacement table; the output retains the complete frozen basis/hash.
    const priced = priceUsage(event, { ...basis.table, entries: basis.table.entries.filter(entry => entry.product === usage.product && entry.model === usage.model ? accepted.has(entry.component) : true) }, inputBasis, context.runtimeEvidence);
    priced.reasons.forEach(reason => reasons.add(reason));
    if (priced.partial_amount !== null) amounts.push(priced.partial_amount); else unavailableEvents++;
  }
  const unknown = matches.filter(match => match.status !== 'matched');
  return { ...report, report_version: basis.catalog.schema_version === 1 ? 'catalog-observed-cost-v1' : 'catalog-observed-cost-request-tiers-v2', price_basis_hash: basis.basis_hash, catalog_hash: basis.catalog_hash,
    catalog_id: basis.catalog.catalog_id, reference_policy_id: basis.policy_id, matching_version: basis.matching_version,
    reference_conditions: basis.conditions, matches, unknown_price_components: unknown.length,
    price_reasons: [...new Set(unknown.flatMap(match => match.reason ? [match.reason] : []))].sort(),
    reasons: [...reasons].sort(), partial_amount: amounts.length ? sumAmounts(amounts) : null, complete_amount: null,
    unavailable_events: unavailableEvents, unpriced_events: new Set(unknown.map(match => match.event_id)).size };
}
