-- Collection authority is separate from the immutable comparison follow-up.
CREATE TABLE binding_collection_controls (
  task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  end_condition TEXT NOT NULL CHECK(end_condition='explicit_stop'),
  authorized_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE TRIGGER immutable_binding_collection_control
BEFORE UPDATE OF task_id,end_condition,authorized_at ON binding_collection_controls
BEGIN SELECT RAISE(ABORT,'immutable_binding_collection_control'); END;
CREATE TRIGGER immutable_binding_collection_revocation
BEFORE UPDATE OF revoked_at ON binding_collection_controls
WHEN OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
BEGIN SELECT RAISE(ABORT,'immutable_binding_collection_revocation'); END;
