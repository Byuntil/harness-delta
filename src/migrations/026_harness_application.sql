ALTER TABLE tasks ADD COLUMN application_mode TEXT NOT NULL DEFAULT 'legacy' CHECK(application_mode IN ('legacy','agent_applied'));
-- Required mode is an opaque, durable fence, independent of private files.
CREATE TABLE harness_application_tasks (
 task_id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 input_hash TEXT NOT NULL,
 current_job TEXT,
 epoch INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE harness_application_jobs (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES harness_application_tasks(task_id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('planning','awaiting_review','applying','verifying','applied','failed','cancelled')),
 intent_hash TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 output_hash TEXT,
 epoch INTEGER NOT NULL DEFAULT 0,
 completed_at TEXT,
 reason_code TEXT
);
CREATE TABLE harness_application_setup_sessions (
 identity_hash TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES harness_application_tasks(task_id) ON DELETE CASCADE,
 job_id TEXT NOT NULL REFERENCES harness_application_jobs(id) ON DELETE CASCADE,
 parent_hash TEXT
);
CREATE TABLE harness_application_session_epochs (
 session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
 task_id TEXT NOT NULL REFERENCES harness_application_tasks(task_id) ON DELETE CASCADE,
 epoch INTEGER NOT NULL
);
CREATE TRIGGER delete_harness_application_task AFTER DELETE ON tasks
BEGIN DELETE FROM harness_application_tasks WHERE task_id=OLD.id; END;
