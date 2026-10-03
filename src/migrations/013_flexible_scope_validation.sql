-- SQL NULL must not bypass the reserved real-store product allowlist.
DROP TRIGGER flexible_real_task_insert;
CREATE TRIGGER flexible_real_task_insert BEFORE INSERT ON tasks
WHEN EXISTS(SELECT 1 FROM flexible_workspace_scope) AND
 (NEW.metadata IS NULL OR COALESCE(json_extract(NEW.metadata,'$.schema_version'),1)!=2 OR
  COALESCE(json_extract(NEW.metadata,'$.product'),'') NOT IN ('codex','claude_code'))
BEGIN SELECT RAISE(ABORT,'real_store_required'); END;
