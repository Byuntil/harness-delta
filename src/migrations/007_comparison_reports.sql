-- Local receipt provenance only; existing events deliberately have unknown receipt time.
CREATE TABLE event_receipts (
  event_id TEXT PRIMARY KEY NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL
);
CREATE TRIGGER immutable_event_receipt BEFORE UPDATE ON event_receipts
BEGIN SELECT RAISE(ABORT, 'immutable_event_receipt'); END;
CREATE TABLE comparison_report_sequences (
  protocol_id TEXT PRIMARY KEY NOT NULL REFERENCES comparison_protocols(id) ON DELETE CASCADE,
  last_sequence INTEGER NOT NULL CHECK(last_sequence > 0)
);
CREATE TABLE comparison_report_snapshots (
  report_id TEXT PRIMARY KEY NOT NULL,
  protocol_id TEXT NOT NULL REFERENCES comparison_protocols(id) ON DELETE CASCADE,
  cutoff TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  data_revision INTEGER NOT NULL CHECK(data_revision >= 0),
  snapshot_sequence INTEGER NOT NULL CHECK(snapshot_sequence > 0),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  descriptive_version TEXT NOT NULL,
  revision_reason TEXT NOT NULL CHECK(revision_reason IN ('initial','late_arrival','cutoff_advanced','evidence_updated')),
  supersedes_report_id TEXT,
  input_json TEXT NOT NULL,
  report_json TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  UNIQUE(protocol_id, snapshot_sequence)
);
CREATE TABLE comparison_report_dependencies (
  report_id TEXT NOT NULL REFERENCES comparison_report_snapshots(report_id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  PRIMARY KEY(report_id, task_id)
);
CREATE INDEX comparison_report_dependency_task ON comparison_report_dependencies(task_id);
CREATE TABLE comparison_report_tombstones (
  report_id TEXT PRIMARY KEY NOT NULL,
  deleted_at TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK(reason_code IN ('deletion','identity_conflict'))
);
CREATE TRIGGER immutable_comparison_snapshot BEFORE UPDATE ON comparison_report_snapshots
BEGIN SELECT RAISE(ABORT, 'immutable_comparison_snapshot'); END;
