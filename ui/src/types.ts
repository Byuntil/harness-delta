export type Locale = 'ko' | 'en';
export interface Project { id: string; name: string; directory: string; baseline: string | null; setup_ids: string[] }
export interface Setup { id: string; name: string; project_id: string; arm_a: string; arm_b: string; types: string[]; sizes: string[]; support: string }
export interface TaskAction { code: string; enabled: boolean; reason: string | null }
export interface Task {
 id: string; name: string; project_id: string; setup_id: string; version: string; state: string; status: string;
 measurement: { state: string; active_ms: number | null; requests: number | null; window: { started_at: string | null; ends_at: string | null } };
 outcome: { status: string; assessed_at: string } | null; attempt: number;
 preparation: { state: string; configuration_evidence: string; native_context_evidence: string; freshness_evidence: string; tool_use_evidence: string; assigned_variant_id: string | null };
 price: { partial_amount: string | null; currency: string; unpriced_events: number; basis: string | null };
 actions: TaskAction[]; startup: { start_command: string; ticket_id: string } | null;
 criteria: string[]; source: { handle: string; label: string } | null; reason: string | null;
}
export interface Catalog { status: string; catalog_version: number | null; verified_at: string | null; verification_age_days?: number | null;
 online_source?: { status: string; publisher_id: string | null }; reason: string | null; can_attempt_online_refresh?: boolean }
export interface Snapshot { projects: Project[]; setups: Setup[]; tasks: Task[]; catalog: Catalog | null }
