-- Local workflow foundations only. Real experiment activation remains disabled.
CREATE TABLE comparison_variants (
  id TEXT PRIMARY KEY NOT NULL,
  configuration TEXT NOT NULL
);
CREATE TABLE comparison_protocols (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  settings TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','frozen','invalidated_by_deletion','identity_conflict')),
  frozen_at TEXT,
  data_revision INTEGER NOT NULL DEFAULT 0 CHECK (data_revision >= 0),
  invalidated_reason TEXT CHECK (invalidated_reason IN ('deletion','identity_conflict')),
  UNIQUE(id, project_id)
);
CREATE TABLE comparison_identity_keys (
  project_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('logical','alias')),
  PRIMARY KEY(project_id, key_id),
  FOREIGN KEY(task_id, project_id) REFERENCES tasks(id, project_id) ON DELETE CASCADE
);
CREATE TABLE comparison_preregistrations (
  task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  metadata TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  code_base_commit TEXT NOT NULL,
  registered_at TEXT NOT NULL
);
CREATE TABLE comparison_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  protocol_id TEXT NOT NULL,
  variant_id TEXT NOT NULL REFERENCES comparison_variants(id),
  assigned_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  followup_ends_at TEXT NOT NULL,
  stratum_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  allocation_index INTEGER NOT NULL CHECK (allocation_index >= 0),
  allocator_id TEXT NOT NULL,
  UNIQUE(protocol_id, stratum_id, allocation_index),
  FOREIGN KEY(task_id, project_id) REFERENCES tasks(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY(protocol_id, project_id) REFERENCES comparison_protocols(id, project_id) ON DELETE CASCADE
);
CREATE TABLE comparison_allocation_state (
  protocol_id TEXT NOT NULL REFERENCES comparison_protocols(id) ON DELETE CASCADE,
  stratum_id TEXT NOT NULL,
  allocator_id TEXT NOT NULL,
  next_index INTEGER NOT NULL DEFAULT 0 CHECK (next_index >= 0),
  block_id TEXT,
  pending_variants TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY(protocol_id, stratum_id)
);
CREATE TABLE comparison_confirmations (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE comparison_confirmation_sessions (
  confirmation_id TEXT NOT NULL REFERENCES comparison_confirmations(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  PRIMARY KEY(confirmation_id, session_id),
  FOREIGN KEY(session_id, task_id, project_id) REFERENCES sessions(id, task_id, project_id) ON DELETE CASCADE
);
CREATE TABLE comparison_deviations (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK (reason_code IN ('mismatch','unknown','crossover','version_drift','reassignment_attempt','cancellation'))
);
CREATE TABLE comparison_identity_tombstones (
  project_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY(project_id, key_id)
);
CREATE TRIGGER immutable_comparison_variant BEFORE UPDATE ON comparison_variants
BEGIN SELECT RAISE(ABORT, 'immutable_comparison_variant'); END;
CREATE TRIGGER immutable_comparison_protocol BEFORE UPDATE OF id,project_id,settings ON comparison_protocols
BEGIN SELECT RAISE(ABORT, 'immutable_comparison_protocol'); END;
CREATE TRIGGER immutable_comparison_assignment BEFORE UPDATE ON comparison_assignments
BEGIN SELECT RAISE(ABORT, 'immutable_comparison_assignment'); END;
CREATE TRIGGER immutable_comparison_preregistration BEFORE UPDATE ON comparison_preregistrations
BEGIN SELECT RAISE(ABORT, 'immutable_comparison_preregistration'); END;
CREATE TRIGGER immutable_comparison_confirmation BEFORE UPDATE ON comparison_confirmations
BEGIN SELECT RAISE(ABORT, 'immutable_comparison_confirmation'); END;
CREATE TRIGGER immutable_comparison_confirmation_session BEFORE UPDATE ON comparison_confirmation_sessions
BEGIN SELECT RAISE(ABORT, 'immutable_comparison_confirmation_session'); END;
CREATE TRIGGER immutable_comparison_deviation BEFORE UPDATE ON comparison_deviations
BEGIN SELECT RAISE(ABORT, 'immutable_comparison_deviation'); END;
CREATE TABLE comparison_workspace_scope (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  purpose TEXT NOT NULL CHECK (purpose = 'synthetic_validation')
);
-- A dedicated validation store cannot acquire real task/source data afterwards.
CREATE TRIGGER comparison_synthetic_task_insert BEFORE INSERT ON tasks
WHEN EXISTS(SELECT 1 FROM comparison_workspace_scope)
  AND (NEW.metadata IS NULL OR COALESCE(json_extract(NEW.metadata,'$.product'),'') != 'synthetic')
BEGIN SELECT RAISE(ABORT, 'synthetic_store_required'); END;
CREATE TRIGGER comparison_synthetic_task_update BEFORE UPDATE OF metadata ON tasks
WHEN EXISTS(SELECT 1 FROM comparison_workspace_scope)
  AND (NEW.metadata IS NULL OR COALESCE(json_extract(NEW.metadata,'$.product'),'') != 'synthetic')
BEGIN SELECT RAISE(ABORT, 'synthetic_store_required'); END;
CREATE TRIGGER comparison_synthetic_session_insert BEFORE INSERT ON sessions
WHEN EXISTS(SELECT 1 FROM comparison_workspace_scope)
  AND (NEW.source_path IS NOT NULL OR (NEW.product IS NOT NULL AND NEW.product != 'synthetic'))
BEGIN SELECT RAISE(ABORT, 'synthetic_store_required'); END;
CREATE TRIGGER comparison_synthetic_session_update BEFORE UPDATE OF source_path,product ON sessions
WHEN EXISTS(SELECT 1 FROM comparison_workspace_scope)
  AND (NEW.source_path IS NOT NULL OR (NEW.product IS NOT NULL AND NEW.product != 'synthetic'))
BEGIN SELECT RAISE(ABORT, 'synthetic_store_required'); END;
CREATE TRIGGER comparison_synthetic_event_insert BEFORE INSERT ON events
WHEN EXISTS(SELECT 1 FROM comparison_workspace_scope)
  AND json_extract(NEW.payload,'$.kind') = 'usage'
  AND COALESCE(json_extract(NEW.payload,'$.product'),'') != 'synthetic'
BEGIN SELECT RAISE(ABORT, 'synthetic_store_required'); END;
