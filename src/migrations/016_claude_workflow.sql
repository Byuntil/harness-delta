-- One trace usage owner per logical task, preserved across workflow invocations.
-- Native logs remain ordering-only and cannot create a second billing channel.
CREATE TABLE claude_workflow_runs (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  confirmation_id TEXT NOT NULL REFERENCES comparison_confirmations(id),
  generation INTEGER NOT NULL,
  instruction_manifest_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('running','completed','failed','stopped')),
  stop_requested INTEGER NOT NULL DEFAULT 0 CHECK(stop_requested IN (0,1)),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  reason TEXT,
  observed_requests INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(task_id,project_id) REFERENCES tasks(id,project_id) ON DELETE CASCADE,
  FOREIGN KEY(session_id,task_id,project_id) REFERENCES sessions(id,task_id,project_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX one_running_claude_workflow ON claude_workflow_runs(task_id) WHERE state='running';
CREATE TRIGGER immutable_claude_workflow_identity BEFORE UPDATE OF id,task_id,project_id,session_id,confirmation_id,generation,instruction_manifest_hash,started_at ON claude_workflow_runs
BEGIN SELECT RAISE(ABORT,'immutable_claude_workflow_identity'); END;
CREATE TRIGGER claude_trace_exclusive_owner BEFORE INSERT ON claude_workflow_runs
WHEN EXISTS(SELECT 1 FROM otel_processes WHERE task_id=NEW.task_id)
 OR EXISTS(SELECT 1 FROM observation_runs WHERE task_id=NEW.task_id)
 OR EXISTS(SELECT 1 FROM sessions WHERE task_id=NEW.task_id AND source_path IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'claude_workflow_source_conflict'); END;
CREATE TRIGGER prevent_trace_log_owner BEFORE INSERT ON otel_processes
WHEN EXISTS(SELECT 1 FROM claude_workflow_runs WHERE task_id=NEW.task_id)
BEGIN SELECT RAISE(ABORT,'claude_workflow_source_conflict'); END;
CREATE TRIGGER prevent_trace_managed_owner BEFORE INSERT ON observation_runs
WHEN EXISTS(SELECT 1 FROM claude_workflow_runs WHERE task_id=NEW.task_id)
BEGIN SELECT RAISE(ABORT,'claude_workflow_source_conflict'); END;
CREATE TRIGGER prevent_trace_file_owner_insert BEFORE INSERT ON sessions
WHEN NEW.source_path IS NOT NULL AND EXISTS(SELECT 1 FROM claude_workflow_runs WHERE task_id=NEW.task_id)
BEGIN SELECT RAISE(ABORT,'claude_workflow_source_conflict'); END;
CREATE TRIGGER prevent_trace_file_owner_update BEFORE UPDATE OF source_path,task_id ON sessions
WHEN NEW.source_path IS NOT NULL AND EXISTS(SELECT 1 FROM claude_workflow_runs WHERE task_id=NEW.task_id)
BEGIN SELECT RAISE(ABORT,'claude_workflow_source_conflict'); END;
