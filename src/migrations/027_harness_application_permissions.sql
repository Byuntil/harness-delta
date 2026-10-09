-- Rebuild parent and child together, with foreign keys enabled throughout.
CREATE TABLE harness_application_jobs_next (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES harness_application_tasks(task_id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('awaiting_execution_approval','planning','awaiting_review','applying','verifying','applied','failed','cancelled')),
 intent_hash TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, output_hash TEXT,
 epoch INTEGER NOT NULL DEFAULT 0, completed_at TEXT, reason_code TEXT
);
INSERT INTO harness_application_jobs_next SELECT * FROM harness_application_jobs;
CREATE TABLE harness_application_setup_sessions_next (
 identity_hash TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES harness_application_tasks(task_id) ON DELETE CASCADE,
 job_id TEXT NOT NULL REFERENCES harness_application_jobs_next(id) ON DELETE CASCADE,
 parent_hash TEXT
);
INSERT INTO harness_application_setup_sessions_next SELECT * FROM harness_application_setup_sessions;
DROP TABLE harness_application_setup_sessions;
DROP TABLE harness_application_jobs;
ALTER TABLE harness_application_jobs_next RENAME TO harness_application_jobs;
ALTER TABLE harness_application_setup_sessions_next RENAME TO harness_application_setup_sessions;
CREATE TABLE harness_application_grants (
 job_id TEXT PRIMARY KEY REFERENCES harness_application_jobs(id) ON DELETE CASCADE,
 proposal_hash TEXT NOT NULL, runtime_hash TEXT NOT NULL, launch_nonce_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','consumed','revoked')),
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT
);
CREATE TABLE harness_application_requests (
 token TEXT PRIMARY KEY,
 job_id TEXT NOT NULL REFERENCES harness_application_jobs(id) ON DELETE CASCADE,
 binding_hash TEXT NOT NULL, payload_hash TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('command','file_change','permissions')),
 state TEXT NOT NULL CHECK(state IN ('pending','decided','fenced')),
 decision TEXT CHECK(decision IN ('approve_once','reject_and_stop')),
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, decided_at TEXT,
 UNIQUE(job_id,binding_hash)
);
