import { resolveSourceCompatibility } from './source-compatibility.js';
import { productionSourceEvidence, type SourceReadinessEvidence } from './readiness.js';

/** Parent-only own-trace workflow profile; admission is per exact version in the registry. */
export const claudeWorkflowProfileId = 'claude-workflow-own-trace-v1';
/** The internal native probe's own pinned version (claude-minimal-run). It is independent of
 * the workflow list below, so retiring a workflow version never changes the probe path. */
export const claudeProbeProductVersion = '2.1.288';
/** Exact admitted versions stay distinct from the conditional workflow window.
 * Candidate-only and internal probe callers continue using this closed list.
 * 2.1.288 was retired on 2026-10-06; see the source-readiness evidence. */
export const claudeWorkflowProductVersions = Object.freeze(['2.1.291'] as const);
export type ClaudeWorkflowProductVersion = string;
export function isClaudeWorkflowProductVersion(value: unknown): value is ClaudeWorkflowProductVersion {
  return typeof value === 'string' && resolveSourceCompatibility('claude_code', value, 'claude_workflow', claudeWorkflowProfileId) !== null;
}

function numericVersion(version: string): [number, number, number] {
  const match = /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/.exec(version);
  if (!match) throw new Error('claude_workflow_version_not_latest');
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
/** Newest admitted Claude workflow version by semantic version order, or null when none is admitted. */
export function newestAdmittedClaudeWorkflowVersion(registry: readonly SourceReadinessEvidence[] = productionSourceEvidence): string | null {
  let newest: string | null = null;
  for (const row of registry) {
    if (row.product !== 'claude_code' || row.profile_id !== claudeWorkflowProfileId || row.validation_kind !== 'real_operations') continue;
    const [a, b, c] = numericVersion(row.product_version);
    if (newest === null) { newest = row.product_version; continue; }
    const [x, y, z] = numericVersion(newest);
    if (a > x || a === x && (b > y || b === y && c > z)) newest = row.product_version;
  }
  return newest;
}
/** Registration-time policy for v2 non-synthetic protocols: at most one Claude workflow profile,
 * at the newest admitted version. A registered protocol keeps its version until it is retired. */
export function requireLatestClaudeWorkflowProfile(profiles: readonly { product: string; product_version: string; profile_id: string }[],
  registry: readonly SourceReadinessEvidence[] = productionSourceEvidence, allowConditional=false): void {
  const claude = profiles.filter(p => p.product === 'claude_code' && p.profile_id === claudeWorkflowProfileId);
  if (claude.length === 0) return;
  if(allowConditional&&claude.length===1&&resolveSourceCompatibility('claude_code',claude[0]!.product_version,'claude_workflow',claudeWorkflowProfileId)?.state==='compatibility_unverified')return;
  if (claude.length > 1 || claude[0]!.product_version !== newestAdmittedClaudeWorkflowVersion(registry)) throw new Error('claude_workflow_version_not_latest');
}
