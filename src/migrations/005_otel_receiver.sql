-- Internal offline OTLP receiver records. No product support profile is established.
-- The per-process token is never stored; only its internal process identity is.
CREATE TABLE otel_processes (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  launch_session_id TEXT NOT NULL,
  product TEXT NOT NULL CHECK (product = 'claude_code'),
  product_version TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 0),
  state TEXT NOT NULL CHECK (state IN ('listening','revoked')),
  ordering TEXT NOT NULL CHECK (ordering IN ('pending','ready','uncertain')),
  next_sequence INTEGER CHECK (next_sequence >= 0),
  current_session_id TEXT,
  uncertain_reason TEXT CHECK (uncertain_reason IN ('ordering_missing','sequence_gap','managed_override','scope_mismatch','identity_conflict','invalid_record','content_enabled')),
  uncertain_observation_id TEXT REFERENCES observations(id) ON DELETE SET NULL,
  revoke_reason TEXT CHECK (revoke_reason IN ('pause','finalize','closed','uncertain','scope_revoked')),
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((state = 'revoked') = (revoke_reason IS NOT NULL)),
  CHECK ((ordering = 'uncertain') = (uncertain_reason IS NOT NULL)),
  FOREIGN KEY(launch_session_id, task_id, project_id) REFERENCES sessions(id, task_id, project_id) ON DELETE CASCADE
);
CREATE INDEX otel_processes_task ON otel_processes(task_id);
CREATE TABLE otel_records (
  process_id TEXT NOT NULL REFERENCES otel_processes(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  event_type TEXT NOT NULL CHECK (event_type IN ('api_request','api_error','managed_settings_resolved','other')),
  record_key TEXT NOT NULL,
  session_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  event_id TEXT UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  PRIMARY KEY(process_id, sequence),
  UNIQUE(process_id, event_type, record_key)
);
CREATE TRIGGER immutable_otel_process BEFORE UPDATE OF id,run_id,project_id,task_id,launch_session_id,product,product_version,profile_id,generation,started_at ON otel_processes
BEGIN SELECT RAISE(ABORT, 'immutable_otel_process'); END;
CREATE TRIGGER immutable_otel_record BEFORE UPDATE ON otel_records
BEGIN SELECT RAISE(ABORT, 'immutable_otel_record'); END;
