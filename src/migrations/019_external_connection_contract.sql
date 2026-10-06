-- New opt-in tasks only. Legacy assignments, protocols and reports stay frozen.
CREATE TABLE external_task_contracts (
  task_id TEXT PRIMARY KEY NOT NULL REFERENCES external_preparations(task_id) ON DELETE CASCADE,
  timing_contract TEXT NOT NULL CHECK(timing_contract='external-first-connection-v1'),
  report_contract TEXT NOT NULL CHECK(report_contract='external-observation-v1'),
  followup_seconds INTEGER NOT NULL CHECK(followup_seconds>0 AND followup_seconds<=315360000),
  registered_at TEXT NOT NULL,
  started_at TEXT,
  ends_at TEXT,
  CHECK((started_at IS NULL)=(ends_at IS NULL))
);
CREATE TRIGGER immutable_external_contract BEFORE UPDATE OF task_id,timing_contract,report_contract,followup_seconds,registered_at ON external_task_contracts
BEGIN SELECT RAISE(ABORT,'immutable_external_contract'); END;
CREATE TRIGGER immutable_external_window BEFORE UPDATE OF started_at,ends_at ON external_task_contracts
WHEN OLD.started_at IS NOT NULL AND (NEW.started_at IS NOT OLD.started_at OR NEW.ends_at IS NOT OLD.ends_at)
BEGIN SELECT RAISE(ABORT,'immutable_external_window'); END;
CREATE TABLE external_start_tickets (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES external_task_contracts(task_id) ON DELETE CASCADE,
  revision TEXT NOT NULL,
  fragment_hash TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  session_id TEXT UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  source_identity TEXT,
  native_created_at TEXT,
  verified_at TEXT,
  CHECK((session_id IS NULL)=(verified_at IS NULL))
);
CREATE TRIGGER immutable_external_ticket BEFORE UPDATE OF id,task_id,revision,fragment_hash,issued_at ON external_start_tickets
BEGIN SELECT RAISE(ABORT,'immutable_external_ticket'); END;
CREATE TRIGGER immutable_external_ticket_evidence BEFORE UPDATE OF session_id,source_identity,native_created_at,verified_at ON external_start_tickets
WHEN OLD.verified_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'immutable_external_ticket_evidence'); END;
