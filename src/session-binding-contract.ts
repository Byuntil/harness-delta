import { z } from 'zod';
import { IdSchema, ProductVersionSchema, TimestampSchema, UsageV2Schema } from './contracts.js';
import type { CandidateScope } from './nested-candidate.js';

export const BindingProductSchema = z.enum(['codex', 'claude_code']);
export type BindingProduct = z.infer<typeof BindingProductSchema>;
export const CurrentIdentityRequestSchema = z.strictObject({ receipt: z.uuid() });
export type CurrentIdentityRequest = z.infer<typeof CurrentIdentityRequestSchema>;
export const VerifiedSessionIdentitySchema = z.strictObject({
  product: BindingProductSchema, productVersion: ProductVersionSchema, sessionId: IdSchema,
  sourceRef: z.string().min(1).max(4096), sourceIdentity: IdSchema,
  cwd: z.string().min(1).max(4096), identityEvidenceId: IdSchema,
  parentSessionId: IdSchema.nullable(), createdAt: TimestampSchema,
  nativeMapping: z.strictObject({ nativeSessionId: IdSchema, processId: IdSchema.nullable(), agentId: IdSchema.nullable() }).optional(),
});
export type VerifiedSessionIdentity = z.infer<typeof VerifiedSessionIdentitySchema>;
export interface BindingCapabilities {
  currentIdentity: 'native_hook' | 'validated_integration' | 'unavailable';
  ancestry: 'verified_relations' | 'unavailable';
  usage: 'own_requests' | 'unavailable';
  productionSupported: boolean;
  maxDepth: number;
  reasons: string[];
}
export interface ChildDiscovery {
  children: { parentSessionId: string; identity: VerifiedSessionIdentity; relationEvidenceId: string }[];
  gaps: string[];
}
export const BindingUsageRecordSchema = z.strictObject({
  requestId: IdSchema, sessionId: IdSchema, occurredAt: TimestampSchema,
  turnId: IdSchema.nullable(), effort: IdSchema.nullable(),
  // Runtime evidence is allocated transactionally by the coordinator. Retain
  // the native reading shape and attribution constraints before that allocation.
  payload: z.strictObject(UsageV2Schema.shape).omit({ runtime_evidence_id: true })
    .refine(value => value.attribution !== 'verified' || value.model !== null)
    .refine(value => value.attribution !== 'ambiguous' || value.model === null),
});
export type BindingUsageRecord = z.infer<typeof BindingUsageRecordSchema>;
export interface UsageBatch { records: BindingUsageRecord[]; excludedRecords?: BindingUsageRecord[]; cursor: string; gaps: string[] }
export interface BindingReadBoundary { baseline: boolean }
/** All source access is downstream of coordinator authorization. Implementations
 * consume native metadata receipts; user/model supplied identity is never proof. */
export interface SessionBindingProvider {
  product: BindingProduct;
  capabilities(): BindingCapabilities;
  resolveCurrent(input: CurrentIdentityRequest): Promise<VerifiedSessionIdentity>;
  discoverChildren(parent: VerifiedSessionIdentity): Promise<ChildDiscovery>;
  /** Metadata-only deletion cleanup. Native transcripts are never deleted. */
  forgetSession?(nativeSessionId: string): Promise<void>;
  // Null returns the initial owned snapshot. The coordinator discards it for
  // roots/restarts, and retains it for a new child born in the observed interval.
  readUsage(session: VerifiedSessionIdentity, cursor: string | null, scope: CandidateScope, boundary?: BindingReadBoundary): Promise<UsageBatch>;
}
