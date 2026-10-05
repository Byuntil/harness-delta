-- Explicit direct-child source checkpoints; no transcript content.
CREATE TABLE codex_workflow_children (
  run_id TEXT PRIMARY KEY NOT NULL REFERENCES codex_workflow_runs(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_identity TEXT,
  source_size INTEGER,
  source_prefix_hash TEXT,
  FOREIGN KEY(session_id,task_id,project_id) REFERENCES sessions(id,task_id,project_id) ON DELETE CASCADE
);
