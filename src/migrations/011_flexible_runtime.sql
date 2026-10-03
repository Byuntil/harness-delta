-- Append-only, task-scoped metadata. No product content is stored here.
CREATE TABLE runtime_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  FOREIGN KEY(session_id, task_id, project_id) REFERENCES sessions(id, task_id, project_id) ON DELETE CASCADE
);
CREATE INDEX runtime_evidence_task_time ON runtime_evidence(task_id, occurred_at);
CREATE TRIGGER immutable_runtime BEFORE UPDATE ON runtime_evidence
BEGIN SELECT RAISE(ABORT, 'immutable_runtime'); END;
CREATE TABLE price_tables (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL);
CREATE TRIGGER immutable_price_table BEFORE UPDATE ON price_tables
BEGIN SELECT RAISE(ABORT, 'immutable_price_table'); END;
CREATE TRIGGER immutable_price_table_delete BEFORE DELETE ON price_tables
BEGIN SELECT RAISE(ABORT, 'immutable_price_table'); END;
CREATE TABLE observation_gaps (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL, session_id TEXT NOT NULL, project_id TEXT NOT NULL,
  started_at TEXT NOT NULL, ended_at TEXT, recorded_at TEXT NOT NULL, reason TEXT NOT NULL,
  FOREIGN KEY(session_id, task_id, project_id) REFERENCES sessions(id, task_id, project_id) ON DELETE CASCADE
);
CREATE TRIGGER immutable_observation_gap BEFORE UPDATE ON observation_gaps
BEGIN SELECT RAISE(ABORT, 'immutable_observation_gap'); END;
