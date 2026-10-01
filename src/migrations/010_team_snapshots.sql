CREATE TABLE exchange_team_snapshots (
  snapshot_id TEXT PRIMARY KEY NOT NULL,
  shared_project_id TEXT NOT NULL,
  protocol_id TEXT NOT NULL,
  request_json TEXT NOT NULL,
  input_json TEXT NOT NULL,
  report_json TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL
);
CREATE TABLE exchange_team_dependencies (
  snapshot_id TEXT NOT NULL REFERENCES exchange_team_snapshots(snapshot_id) ON DELETE CASCADE,
  namespace_id TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,namespace_id)
);
CREATE TABLE exchange_team_sequences (
  shared_project_id TEXT NOT NULL,
  protocol_id TEXT NOT NULL,
  last_sequence INTEGER NOT NULL,
  PRIMARY KEY(shared_project_id,protocol_id)
);
CREATE TABLE exchange_team_report_tombstones (
  snapshot_id TEXT PRIMARY KEY NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('deletion','identity_conflict'))
);
