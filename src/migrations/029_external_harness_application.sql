-- New lifecycle, independent of old supervised jobs. Preserve historical rows.
CREATE TABLE harness_application_attempts (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES harness_application_tasks(task_id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('awaiting_session','applying','verifying','applied','failed','abandoned')),
 context_hash TEXT NOT NULL,
 result_hash TEXT,
 epoch INTEGER NOT NULL,
 completed_at TEXT,
 reason_code TEXT,
 launch_state TEXT NOT NULL DEFAULT 'not_requested' CHECK(launch_state IN ('not_requested','open_requested','open_failed')),
 identity_hash TEXT
);
CREATE TABLE harness_application_checkpoints (
 id TEXT PRIMARY KEY,
 attempt_id TEXT NOT NULL REFERENCES harness_application_attempts(id) ON DELETE CASCADE,
 path_hash TEXT NOT NULL,
 before_hash TEXT,
 record_hash TEXT NOT NULL,
 UNIQUE(attempt_id,path_hash)
);
CREATE TABLE harness_application_roles (
 identity_hash TEXT PRIMARY KEY,
 attempt_id TEXT NOT NULL REFERENCES harness_application_attempts(id) ON DELETE CASCADE,
 parent_hash TEXT
);
CREATE TRIGGER delete_external_application_attempt AFTER DELETE ON tasks
BEGIN DELETE FROM harness_application_attempts WHERE task_id=OLD.id; END;
