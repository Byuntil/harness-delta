-- Opaque session exclusions survive deletion; they cannot recreate task records.
CREATE TABLE harness_application_exclusions (
 identity_hash TEXT PRIMARY KEY
);
INSERT OR IGNORE INTO harness_application_exclusions SELECT identity_hash FROM harness_application_roles;
INSERT OR IGNORE INTO harness_application_exclusions SELECT identity_hash FROM harness_application_setup_sessions;
CREATE TRIGGER retain_application_role_exclusion AFTER INSERT ON harness_application_roles
BEGIN INSERT OR IGNORE INTO harness_application_exclusions VALUES(NEW.identity_hash); END;
CREATE TRIGGER retain_legacy_application_exclusion AFTER DELETE ON harness_application_setup_sessions
BEGIN INSERT OR IGNORE INTO harness_application_exclusions VALUES(OLD.identity_hash); END;
-- Local cleanup journal only. No file content, no FK capable of task resurrection.
CREATE TABLE harness_application_cleanup (
 task_id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 project_root TEXT NOT NULL,
 root_identity TEXT NOT NULL,
 reason_code TEXT NOT NULL DEFAULT 'application_cleanup_pending'
);
