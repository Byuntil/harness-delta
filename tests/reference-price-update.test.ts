import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { bundledCatalogBytes, compilePriceBasis, digest, matchCatalogComponent, parsePriceCatalog } from '../src/price-catalog.js';
import { preparePriceCatalogRelease } from '../src/price-catalog-release.js';
import { preparePriceBasis, readPriceBasis, readPriceCatalogStatus, refreshPriceCatalog } from '../src/price-catalog-store.js';
import { registerProtocolWithCatalogDefaults, selectTaskPriceTable } from '../src/price-catalog-selection.js';
import { freezeProtocol, registerVariant, showProtocol } from '../src/comparison.js';
import { assignTask } from '../src/allocation.js';
import { projectCatalogCost } from '../src/catalog-cost-report.js';
import { Store } from '../src/store.js';
import { makeFlexibleFixture } from './helpers/flexible-fixture.js';
import { assignmentInput, beforeRecruitment, seedProject } from './helpers/comparison-fixture.js';

const candidateUrl = new URL('../config/prices/catalogs/reference-catalog-2026-10-08.json', import.meta.url);
const now = '2026-10-08T12:00:00Z';
function candidateBytes() {
  expect(existsSync(candidateUrl), 'release candidate must exist').toBe(true);
  return readFileSync(candidateUrl);
}
function candidate() { return parsePriceCatalog(JSON.parse(candidateBytes().toString('utf8')) as unknown); }

test('candidate changes only the source-verified Sonnet row and adds verified request tiers for the literal Haiku ID', () => {
  const previous = parsePriceCatalog(JSON.parse(bundledCatalogBytes().toString('utf8')) as unknown);
  const next = candidate();
  expect(next).toMatchObject({ schema_version: 2, catalog_id: 'reference-catalog-2026-10-08', catalog_version: 2,
    policy_id: 'reference-standard-request-tiers-v2', currency: 'USD', unit_tokens: 1000000,
    verified_at: '2026-10-08T00:00:00Z', published_at: '2026-10-08T00:00:00Z' });
  expect(next.models).toHaveLength(8);
  for (const row of previous.models) {
    const updated = next.models.find(model => model.model === row.model);
    expect(updated).toEqual(row.model === 'claude-sonnet-5-5'
      ? { ...row, rates: { ...row.rates, cache_read: '0.1' }, verified_at: next.verified_at } : row);
  }
  expect(next.models.find(row => row.model === 'claude-haiku-5-5')).toEqual({
    product: 'claude_code', provider_id: 'anthropic', model: 'claude-haiku-5-5', aliases: [], rates: {},
    source_url: 'https://platform.claude.com/docs/en/about-claude/pricing', verified_at: next.verified_at,
    effective_from: null, effective_until: null,
    prompt_tiers: { up_to_100000: { ordinary_input: '0.1', cache_read: '0.01', cache_write: '0.125', output: '0.5' },
      over_100000: { ordinary_input: '0.5', cache_read: '0.05', cache_write: '0.625', output: '2.5' } },
  });
});

test('candidate prices Sonnet cache reads while Haiku tier ambiguity stays missing, never zero', () => {
  const basis = compilePriceBasis(candidate());
  const original = makeFlexibleFixture().events[0]!;
  const sonnet = { ...original, payload: { ...original.payload, product: 'claude_code' as const, model: 'claude-sonnet-5-5' } };
  expect(matchCatalogComponent(sonnet, 'cache_read', basis)).toMatchObject({ status: 'matched', price_per_unit: '0.1' });
  // Synthetic disjoint usage: 100 ordinary input, 20 cache read, 10 inclusive output.
  expect(projectCatalogCost([sonnet], basis, sonnet.task_id, now, 'output-only-v1')).toMatchObject({ partial_amount: null, legacy_unverified_partial_amount: '0.000302', complete_amount: null });
  const haiku = { ...sonnet, payload: { ...sonnet.payload, model: 'claude-haiku-5-5' } };
  for (const component of ['ordinary_input', 'cache_read', 'cache_write', 'output'] as const) {
    expect(matchCatalogComponent(haiku, component, basis)).toMatchObject({ canonical_model: 'claude-haiku-5-5', status: 'unavailable', reason: 'unverified_condition', price_per_unit: null });
  }
  expect(basis.table.entries.some(row => row.model === 'claude-haiku-5-5')).toBe(true);
  expect(projectCatalogCost([haiku], basis, haiku.task_id, now, 'output-only-v1')).toMatchObject({ partial_amount: null, complete_amount: null, unknown_price_components: 3 });
  const fabricated = { ...haiku, payload: { ...haiku.payload, model: 'claude-haiku-5-5-20261007' } };
  expect(matchCatalogComponent(fabricated, 'output', basis)).toMatchObject({ reason: 'unknown_model' });
});

test('candidate refresh preserves v1 bytes, stored tables and the frozen comparison pin', async () => {
  const oldBytes = bundledCatalogBytes();
  expect(digest(oldBytes)).toBe('ae7f1aefab3b78f87bf9259b68b29882edc498b305831e3c2b3146f0968adf24');
  expect(oldBytes).toHaveLength(3476);
  const store = new Store(':memory:');
  try {
    seedProject(store);
    const fixture = makeFlexibleFixture();
    fixture.variants.forEach(variant => registerVariant(store, variant));
    const { price_table_id: omitted, ...draft } = fixture.protocol; void omitted;
    registerProtocolWithCatalogDefaults(store, draft, now);
    const first = preparePriceBasis(store, now);
    expect(first.table.id).toBe('catalog-prices-16acc0a0fb77e373f311591ffd69262641f0aafcd57470abc4509cfee5a7c4e4');
    const firstBytes = store.get<{ payload: string }>('SELECT payload FROM price_catalog_bases WHERE price_table_id=?', [first.table.id])!.payload;
    freezeProtocol(store, fixture.protocol.id, beforeRecruitment);
    assignTask(store, { ...assignmentInput, schema_version: 2, task_id: 'task', logical_task_id: 'logical', metadata: fixture.metadata },
      { clock: () => fixture.protocol.recruitment_start, shuffle: rows => rows });
    const bytes = candidateBytes();
    expect(await refreshPriceCatalog(store, () => Promise.resolve(bytes), digest(bytes), now)).toMatchObject({ status: 'updated' });
    expect(readPriceCatalogStatus(store)).toMatchObject({ catalog_id: 'reference-catalog-2026-10-08', catalog_version: 2 });
    expect(preparePriceBasis(store, now).table.id).not.toBe(first.table.id);
    expect(readPriceBasis(store, first.table.id)).toEqual(first);
    expect(store.get<{ payload: string }>('SELECT payload FROM price_catalog_bases WHERE price_table_id=?', [first.table.id])!.payload).toBe(firstBytes);
    expect(selectTaskPriceTable(store, 'task', now)).toEqual({ tableId: first.table.id, selection: 'frozen_comparison' });
    expect(showProtocol(store, fixture.protocol.id)).toMatchObject({ configuration: { price_table_id: first.table.id } });
    expect(await refreshPriceCatalog(store, () => Promise.resolve(oldBytes), digest(oldBytes), now)).toMatchObject({ reason: 'catalog_rollback' });
    expect(readPriceCatalogStatus(store).catalog_version).toBe(2);
  } finally { store.close(); }
  expect(bundledCatalogBytes()).toEqual(oldBytes);
});

test('candidate release manifest binds exact candidate bytes and leaves the bootstrap at v1', () => {
  const bytes = candidateBytes();
  const release = preparePriceCatalogRelease(bytes);
  expect(release.manifest).toMatchObject({ catalog_id: 'reference-catalog-2026-10-08', catalog_version: 2,
    verified_at: '2026-10-08T00:00:00Z', artifact_sha256: digest(bytes), artifact_bytes: bytes.length });
  expect(release.artifact).toEqual(bytes);
  expect(release.manifest.artifact_file).toBe(`catalog-${digest(bytes)}.json`);
  expect(parsePriceCatalog(JSON.parse(bundledCatalogBytes().toString('utf8')) as unknown).catalog_version).toBe(1);
});
