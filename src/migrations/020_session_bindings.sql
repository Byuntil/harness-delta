-- Verified native metadata bindings. Private source references never enter exports.
CREATE TABLE session_bindings (
  session_id TEXT PRIMARY KEY NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  root_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  identity TEXT NOT NULL,
  relation_evidence_id TEXT,
  cursor TEXT,
  observed_since TEXT NOT NULL,
  generation INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('observing','stopped')),
  gaps TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE binding_requests (
  request_key TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL
);
CREATE INDEX session_bindings_task ON session_bindings(task_id);
