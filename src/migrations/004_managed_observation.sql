-- Internal synthetic evidence only. No production completeness profile.
CREATE TABLE observation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  generation INTEGER NOT NULL CHECK (generation >= 0),
  profile_id TEXT NOT NULL CHECK (profile_id = 'synthetic-managed-v1'),
  state TEXT NOT NULL CHECK (state IN ('preparing','ready','running','draining','sealed','interrupted')),
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ended_at TEXT,
  submitted_at TEXT,
  stop_reason TEXT CHECK (stop_reason IN ('cancel','timeout','crash','pause','finalize','restart','scope_revoked','identity_conflict','invalid_envelope','transport_error','storage_error','clock_regressed','incomplete')),
  terminal_sequence INTEGER CHECK (terminal_sequence >= 0),
  channel_ended INTEGER NOT NULL DEFAULT 0 CHECK (channel_ended IN (0,1)),
  input_facts TEXT NOT NULL,
  output_facts TEXT NOT NULL,
  FOREIGN KEY(session_id, task_id, project_id) REFERENCES sessions(id, task_id, project_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX one_open_observation_run ON observation_runs(task_id)
  WHERE state NOT IN ('sealed','interrupted');
CREATE TABLE observation_records (
  run_id TEXT NOT NULL REFERENCES observation_runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  request_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  PRIMARY KEY(run_id, sequence),
  UNIQUE(run_id, request_id)
);
CREATE TRIGGER immutable_run_identity BEFORE UPDATE OF id,project_id,task_id,session_id,generation,profile_id,started_at ON observation_runs
BEGIN SELECT RAISE(ABORT, 'immutable_run_identity'); END;
CREATE TRIGGER immutable_observation_record BEFORE UPDATE ON observation_records
BEGIN SELECT RAISE(ABORT, 'immutable_observation_record'); END;
