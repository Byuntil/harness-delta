import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { TimestampSchema } from './contracts.js';
import { FlexibleProtocolSchema, FlexibleVariantSchema, PriceTableSchema } from './flexible-contracts.js';
import { comparisonProtocol, freezeProtocol, protocolRow, registerProtocol, registerVariant } from './comparison.js';
import { readPriceTable, registerPriceTable } from './pricing.js';
import { LocalWebProfileSchema, type LocalWebProfile } from './local-web-domain.js';
import type { createSharedSetupManager } from './local-web-shared.js';
import { localWebError } from './local-web-server.js';
import type { Store } from './store.js';
import { hashBytes } from './harness-config.js';

// This envelope is private UI input. Its contents use the existing production contracts.
export const SetupReviewInputSchema = z.strictObject({
  comparison_path: z.string().min(1).max(4096),
  template_id: z.lazy(() => LocalWebProfileSchema.shape.id),
  profile: z.lazy(() => LocalWebProfileSchema.refine(profile => !profile.shared_binding)).optional(),
  variants: z.array(FlexibleVariantSchema).max(2).optional(),
  protocol: FlexibleProtocolSchema.optional(),
  price_table: PriceTableSchema.optional(),
  freeze_at: TimestampSchema.optional(),
});
type ReviewInput = z.infer<typeof SetupReviewInputSchema>;
type Issue = { field: string; code: string };
export function createSetupReviewManager(
  store: Store, privateDb: Database.Database, profiles: () => LocalWebProfile[],
  saveProfiles: (inputs: LocalWebProfile[]) => unknown,
  shared: ReturnType<typeof createSharedSetupManager>,
) {
  const tokens = new Map<string, { input: ReviewInput; hash: string; expires: number }>();
  const rollback = new Error('setup_review_rollback');
  function apply(input: ReviewInput) {
    if (input.profile && input.profile.id !== input.template_id) throw new Error('invalid_ui_setup');
    if (input.price_table) registerPriceTable(store, input.price_table);
    for (const variant of input.variants ?? []) registerVariant(store, variant);
    if (input.protocol) registerProtocol(store, input.protocol);
    const profile = input.profile ?? profiles().find(row => row.id === input.template_id && !row.shared_binding);
    if (!profile) throw new Error('shared_registration_required');
    const row = protocolRow(store, profile.setup.workflow.assignment.protocol_id);
    if (row.status !== 'frozen') {
      if (!input.freeze_at) throw new Error('incomplete_protocol');
      freezeProtocol(store, row.id, input.freeze_at);
    }
    saveProfiles([profile]);
    const preview = shared.preview(input.comparison_path);
    try {
      const project = preview.projects.find(row => row.project_id === profile.setup.workflow.assignment.project_id);
      const template = project?.templates.find(row => row.id === input.template_id);
      if (!project || !template) throw new Error('shared_registration_required');
      if (template.blocker) throw new Error(template.blocker);
      const protocol = comparisonProtocol(store, protocolRow(store, row.id));
      if (protocol.schema_version !== 2) throw new Error('shared_registration_mismatch');
      return { preview, profile, protocol, price_table: readPriceTable(store, protocol.price_table_id) };
    } catch (error) { shared.discardPreview(preview.token); throw error; }
  }
  function missing(input: ReviewInput): Issue[] {
    const issues: Issue[] = [];
    const profile = input.profile ?? profiles().find(row => row.id === input.template_id && !row.shared_binding);
    if (!profile) issues.push({ field: 'profile', code: 'shared_registration_required' });
    const projectId = profile?.setup.workflow.assignment.project_id ?? input.protocol?.project_id;
    if (projectId && !store.get('SELECT id FROM projects WHERE id=?', [projectId]))
      issues.push({ field: `project:${projectId}`, code: 'unknown_project' });
    const protocolId = profile?.setup.workflow.assignment.protocol_id;
    const row = protocolId ? store.get<{ settings: string; status: string }>('SELECT settings,status FROM comparison_protocols WHERE id=?', [protocolId]) : undefined;
    const protocol = input.protocol ?? (row ? FlexibleProtocolSchema.parse(JSON.parse(row.settings) as unknown) : undefined);
    if (protocolId && !row && input.protocol?.id !== protocolId)
      issues.push({ field: `protocol:${protocolId}`, code: 'unknown_protocol' });
    if (protocol && !input.freeze_at && row?.status !== 'frozen')
      issues.push({ field: 'freeze_at', code: 'incomplete_protocol' });
    for (const id of protocol?.variant_ids ?? []) {
      if (!input.variants?.some(variant => variant.id === id) && !store.get('SELECT id FROM comparison_variants WHERE id=?', [id]))
        issues.push({ field: `variant:${id}`, code: 'unknown_variant' });
    }
    if (protocol && input.price_table?.id !== protocol.price_table_id && !store.get('SELECT id FROM price_tables WHERE id=?', [protocol.price_table_id]))
      issues.push({ field: `price_table:${protocol.price_table_id}`, code: 'unknown_price_table' });
    return issues;
  }
  const identity = (result: ReturnType<typeof apply>) => hashBytes(JSON.stringify({
    profile: result.profile, protocol: result.protocol, price_table: result.price_table,
    pairs: result.preview.projects.map(project => ({ project_id: project.project_id, pair: project.pair })),
  }));
  return {
    review(raw: unknown) {
      const parsed = SetupReviewInputSchema.safeParse(raw);
      if (!parsed.success) return { ready: false as const, issues: parsed.error.issues.map(issue => ({ field: issue.path.join('.'), code: issue.code })) };
      try {
        const issues = missing(parsed.data);
        if (issues.length) return { ready: false as const, issues };
        let result: ReturnType<typeof apply> | undefined;
        try {
          privateDb.transaction(() => store.immediateTransaction(() => {
            result = apply(parsed.data);
            throw rollback;
          }))();
        } catch (error) { if (error !== rollback) throw error; }
        finally { if (result) shared.discardPreview(result.preview.token); }
        if (!result) throw new Error('invalid_ui_setup');
        for (const [token, value] of tokens) if (value.expires < Date.now()) tokens.delete(token);
        if (tokens.size >= 64) throw new Error('shared_import_limit');
        const token = randomUUID();
        tokens.set(token, { input: parsed.data, hash: identity(result), expires: Date.now() + 300000 });
        return { ready: true as const, token, registrations: parsed.data, ...result };
      } catch (error) { return { ready: false as const, issues: [{ field: 'registrations', code: localWebError(error) }] }; }
    },
    save(token: string) {
      const selected = tokens.get(token);
      if (!selected || selected.expires < Date.now()) throw new Error('shared_import_expired');
      // Re-run the production checks under writer locks; a review is not a reservation.
      let previewToken: string | undefined;
      let result: ReturnType<typeof apply>;
      try {
        result = privateDb.transaction(() => store.immediateTransaction(() => {
          const current = apply(selected.input);
          previewToken = current.preview.token;
          if (identity(current) !== selected.hash) throw new Error('shared_preview_changed');
          return current;
        }))();
      } catch (error) { if (previewToken) shared.discardPreview(previewToken); throw error; }
      tokens.delete(token);
      return result.preview;
    },
  };
}
export type SetupReviewResult = ReturnType<ReturnType<typeof createSetupReviewManager>['review']>;
