-- Deletion receipts survive task/project cascades and server restart. Private
-- project scope only; no transcript path, contents or provider credentials.
CREATE TABLE session_binding_forgets (
  product TEXT NOT NULL,
  native_session_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  project_root TEXT NOT NULL,
  reason_code TEXT,
  PRIMARY KEY(product,native_session_id)
);
CREATE TRIGGER forget_deleted_binding BEFORE DELETE ON session_bindings
WHEN json_extract(OLD.identity,'$.product')='claude_code'
BEGIN
  INSERT OR IGNORE INTO session_binding_forgets(product,native_session_id,task_id,project_root)
  VALUES ('claude_code',COALESCE(json_extract(OLD.identity,'$.nativeMapping.nativeSessionId'),OLD.session_id),OLD.task_id,json_extract(OLD.identity,'$.cwd'));
END;
