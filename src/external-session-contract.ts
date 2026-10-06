import { comparisonProtocol, protocolRow } from './comparison.js';
import { IdSchema, TimestampSchema } from './contracts.js';
import { utcNow, type Clock } from './lifecycle.js';
import type { Store } from './store.js';

export interface ExternalTaskContract {
  task_id: string; timing_contract: 'external-first-connection-v1'; report_contract: 'external-observation-v1';
  followup_seconds: number; registered_at: string; started_at: string | null; ends_at: string | null;
}
export function externalContract(store: Store, taskId: string): ExternalTaskContract | undefined {
  // Old-schema fixture replay and historical report reading remain possible.
  if (!store.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='external_task_contracts'")) return undefined;
  return store.get<ExternalTaskContract>('SELECT * FROM external_task_contracts WHERE task_id=?', [IdSchema.parse(taskId)]);
}
export function registerExternalContract(store: Store, taskId: string, clock: Clock = utcNow): ExternalTaskContract {
  const now = new Date(TimestampSchema.parse(clock())).toISOString();
  return store.immediateTransaction(() => {
    const old = externalContract(store, taskId); if (old) return old;
    const assignment = store.get<{protocol_id: string}>('SELECT protocol_id FROM comparison_assignments WHERE task_id=?', [taskId]);
    if (!assignment) throw new Error('task_not_assigned');
    const protocol = comparisonProtocol(store, protocolRow(store, assignment.protocol_id));
    if (protocol.schema_version !== 2) throw new Error('external_contract_unsupported');
    if (store.get(`SELECT 1 FROM sessions WHERE task_id=? UNION ALL SELECT 1 FROM events WHERE task_id=?
      UNION ALL SELECT 1 FROM active_intervals WHERE task_id=? UNION ALL SELECT 1 FROM external_preparations WHERE task_id=? AND first_connected_at IS NOT NULL`, [taskId,taskId,taskId,taskId])) throw new Error('external_contract_requires_new_task');
    store.execute(`INSERT INTO external_task_contracts(task_id,timing_contract,report_contract,followup_seconds,registered_at)
      VALUES (?,'external-first-connection-v1','external-observation-v1',?,?)`, [taskId,protocol.followup_seconds,now]);
    return externalContract(store, taskId)!;
  });
}
export function assertLegacyComparisonTiming(store: Store, protocolId: string): void {
  if (!store.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='external_task_contracts'")) return;
  if (store.get('SELECT 1 FROM external_task_contracts c JOIN comparison_assignments a ON a.task_id=c.task_id WHERE a.protocol_id=?', [protocolId])) throw new Error('timing_contract_mismatch');
}
