import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test } from 'vitest';
import { setupReviewFixture } from './helpers/setup-review-fixture.js';
import { registerVariant } from '../src/comparison.js';
import { createLocalWebDomain } from '../src/local-web-domain.js';
import { createLocalWebServer } from '../src/local-web-server.js';

test('review lists missing registrations and incomplete input fields without writing', async () => {
  const f = setupReviewFixture(false);
  try {
    const { variants: ignoredVariants, price_table: ignoredPrice, freeze_at: ignoredFreeze, ...input } = f.input;
    void ignoredVariants; void ignoredPrice; void ignoredFreeze;
    const review = await f.domain.reviewSetup!(input);
    expect(review.ready).toBe(false); if (review.ready) throw new Error('unexpected_review');
    for (const issue of [
      { field: 'project:project-1', code: 'unknown_project' },
      { field: 'freeze_at', code: 'incomplete_protocol' },
      { field: `variant:${f.input.protocol.variant_ids[0]}`, code: 'unknown_variant' },
      { field: `variant:${f.input.protocol.variant_ids[1]}`, code: 'unknown_variant' },
      { field: `price_table:${f.input.protocol.price_table_id}`, code: 'unknown_price_table' },
    ]) expect(review.issues).toContainEqual(issue);
    const incomplete = await f.domain.reviewSetup!({ ...f.input, protocol: { schema_version: 2 } });
    expect(incomplete.ready).toBe(false);
    if (!incomplete.ready) expect(incomplete.issues.some(issue => issue.field === 'protocol.sample_plan')).toBe(true);
    expect(f.store.all('SELECT * FROM comparison_variants')).toHaveLength(0);
    expect(f.store.all('SELECT * FROM comparison_protocols')).toHaveLength(0);
    expect(f.store.all('SELECT * FROM price_tables')).toHaveLength(0);
  } finally { await f.domain.close?.(); f.cleanup(); }
});

test('review rolls back production registrations until explicit save and reuses exact reviewed inputs', async () => {
  const f = setupReviewFixture();
  let restarted: ReturnType<typeof createLocalWebDomain> | undefined;
  try {
    const reviewed = await f.domain.reviewSetup!(f.input);
    expect(reviewed.ready).toBe(true); if (!reviewed.ready) throw new Error('review_failed');
    expect(reviewed.profile.setup.workflow.assignment.metadata.criterion_ids).toEqual(f.profile.setup.workflow.assignment.metadata.criterion_ids);
    expect(reviewed.protocol.variant_ids).toEqual(f.input.protocol.variant_ids);
    expect(f.store.all('SELECT * FROM comparison_variants')).toHaveLength(0);
    expect(f.store.all('SELECT * FROM comparison_protocols')).toHaveLength(0);
    expect(f.store.all('SELECT * FROM price_tables')).toHaveLength(0);
    const privateDb = new Database(f.metadataFile);
    expect(privateDb.prepare('SELECT * FROM web_profiles').all()).toHaveLength(0); privateDb.close();
    const preview = await f.domain.saveReviewedSetup!(reviewed.token);
    const bound = await f.domain.bindSetup!({ token: preview.token, project_id: 'project-1', template_id: f.profile.id }) as { profile_id: string; local_setup_path: string };
    const bytes = readFileSync(join(f.project, bound.local_setup_path));
    const repeat = await f.domain.reviewSetup!({ comparison_path: f.input.comparison_path, template_id: f.profile.id });
    expect(repeat.ready).toBe(true); if (!repeat.ready) throw new Error('review_failed');
    expect(repeat.profile).toEqual(reviewed.profile);
    const again = await f.domain.saveReviewedSetup!(repeat.token);
    expect(await f.domain.bindSetup!({ token: again.token, project_id: 'project-1', template_id: f.profile.id })).toMatchObject({ already_connected: true, profile_id: bound.profile_id });
    expect(readFileSync(join(f.project, bound.local_setup_path))).toEqual(bytes);
    expect(f.store.all('SELECT * FROM comparison_protocols')).toHaveLength(1);
    expect(f.store.all('SELECT * FROM comparison_variants')).toHaveLength(2);
    await f.domain.close?.();
    restarted = createLocalWebDomain({ store: f.store, metadataFile: f.metadataFile });
    const task = await restarted.createTask({ name: 'Synthetic prepared task', project_id: 'project-1', setup_id: bound.profile_id }) as { id: string };
    await restarted.taskAction(task.id, 'apply', {});
    expect(restarted.task(task.id).status).toBe('validation_ready');
    expect(f.store.all('SELECT * FROM comparison_assignments')).toHaveLength(1);
    expect(f.store.all('SELECT * FROM sessions')).toHaveLength(0);
    expect(f.store.eventCount()).toBe(0);
    expect(f.store.all('SELECT * FROM active_intervals')).toHaveLength(0);
  } finally { await restarted?.close?.(); if (!restarted) await f.domain.close?.(); f.cleanup(); }
});

test('production conflicts roll back a reviewed batch and never replace existing variants', async () => {
  const f = setupReviewFixture();
  try {
    const reviewed = await f.domain.reviewSetup!(f.input); if (!reviewed.ready) throw new Error('review_failed');
    const second = f.input.variants[1]; if (!second) throw new Error('synthetic_fixture_invalid');
    const conflicting = { ...second, policy_version: 'conflicting-policy' };
    registerVariant(f.store, conflicting);
    expect(() => f.domain.saveReviewedSetup!(reviewed.token)).toThrow('configuration_conflict');
    expect(f.store.all('SELECT id FROM comparison_variants')).toEqual([{ id: conflicting.id }]);
    expect(f.store.all('SELECT * FROM comparison_protocols')).toHaveLength(0);
    expect(f.store.all('SELECT * FROM price_tables')).toHaveLength(0);
    const privateDb = new Database(f.metadataFile);
    expect(privateDb.prepare('SELECT * FROM web_profiles').all()).toHaveLength(0); privateDb.close();
  } finally { await f.domain.close?.(); f.cleanup(); }
});

test('a changed portable descriptor invalidates review before any registrations are committed', async () => {
  const f = setupReviewFixture();
  try {
    const reviewed = await f.domain.reviewSetup!(f.input); if (!reviewed.ready) throw new Error('review_failed');
    const descriptor = JSON.parse(readFileSync(f.input.comparison_path, 'utf8')) as Record<string, unknown>;
    descriptor.name = 'Synthetic changed pair';
    // Keep the test descriptor valid by updating its canonical hash through the production hash function.
    const { settings_hash: ignored, ...fields } = descriptor; void ignored;
    const { canonicalJson, hashBytes } = await import('../src/harness-config.js');
    writeFileSync(f.input.comparison_path, JSON.stringify({ ...fields, settings_hash: hashBytes(`harness-delta:comparison:v1\n${canonicalJson(fields)}`) }));
    expect(() => f.domain.saveReviewedSetup!(reviewed.token)).toThrow('shared_preview_changed');
    expect(f.store.all('SELECT * FROM comparison_variants')).toHaveLength(0);
    expect(f.store.all('SELECT * FROM comparison_protocols')).toHaveLength(0);
  } finally { await f.domain.close?.(); f.cleanup(); }
});

test('review and save transport enforce authorization and exact idempotent replay', async () => {
  const f = setupReviewFixture(); const origin = 'http://127.0.0.1:4329';
  const app = createLocalWebServer({ origin, domain: f.domain, metadataFile: f.metadataFile });
  try {
    const headers = { host: '127.0.0.1:4329', origin, 'content-type': 'application/json' };
    expect((await app.inject({ method: 'POST', url: '/api/setup-review', headers, payload: f.input })).statusCode).toBe(403);
    const csrf = (await app.inject({ url: '/api/bootstrap', headers: { host: headers.host } })).json<{ csrf: string }>().csrf;
    const authorized = { ...headers, 'x-harness-csrf': csrf, 'idempotency-key': randomUUID() };
    const review = (await app.inject({ method: 'POST', url: '/api/setup-review', headers: authorized, payload: f.input })).json<{ token: string; ready: boolean }>();
    expect(review.ready).toBe(true);
    const payload = { token: review.token };
    const saved = await app.inject({ method: 'POST', url: '/api/setup-save-reviewed', headers: authorized, payload });
    expect(saved.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/setup-save-reviewed', headers: authorized, payload })).body).toBe(saved.body);
    expect((await app.inject({ method: 'POST', url: '/api/setup-save-reviewed', headers: authorized, payload: { token: randomUUID() } })).statusCode).toBe(400);
    expect(f.store.all('SELECT * FROM tasks')).toHaveLength(0);
  } finally { await app.close(); f.cleanup(); }
});

test('failed and rolled-back reviews release shared previews across more than the bounded cache capacity', async () => {
  const f = setupReviewFixture();
  try {
    const invalid = { ...f.input, variants: f.input.variants.map(variant => ({ ...variant, instruction_manifest_hash: 'a'.repeat(64) })) };
    for (let index = 0; index < 70; index++) {
      expect(await f.domain.reviewSetup!(invalid)).toMatchObject({ ready: false, issues: [{ field: 'registrations', code: 'shared_registration_mismatch' }] });
    }
    const valid = await f.domain.reviewSetup!(f.input);
    expect(valid.ready).toBe(true); if (!valid.ready) throw new Error('review_failed');
    const preview = await f.domain.saveReviewedSetup!(valid.token);
    expect(preview.projects[0]?.templates[0]?.blocker).toBeNull();
    expect(f.store.all('SELECT * FROM comparison_variants')).toHaveLength(2);
  } finally { await f.domain.close?.(); f.cleanup(); }
});
