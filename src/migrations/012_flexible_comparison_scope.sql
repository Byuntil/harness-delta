-- Additive v2 storage preserves every v1 snapshot byte and dependency.
CREATE TABLE flexible_report_snapshots (
 report_id TEXT PRIMARY KEY NOT NULL,
 protocol_id TEXT NOT NULL REFERENCES comparison_protocols(id) ON DELETE CASCADE,
 cutoff TEXT NOT NULL, evaluated_at TEXT NOT NULL, data_revision INTEGER NOT NULL,
 snapshot_sequence INTEGER NOT NULL, schema_version INTEGER NOT NULL CHECK(schema_version=2),
 descriptive_version TEXT NOT NULL, revision_reason TEXT NOT NULL,
 supersedes_report_id TEXT, input_json TEXT NOT NULL, report_json TEXT NOT NULL, snapshot_hash TEXT NOT NULL,
 UNIQUE(protocol_id,snapshot_sequence)
);
CREATE TABLE flexible_report_dependencies (
 report_id TEXT NOT NULL REFERENCES flexible_report_snapshots(report_id) ON DELETE CASCADE,
 task_id TEXT NOT NULL REFERENCES tasks(id), PRIMARY KEY(report_id,task_id)
);
CREATE INDEX flexible_report_dependency_task ON flexible_report_dependencies(task_id);
CREATE TRIGGER immutable_flexible_snapshot BEFORE UPDATE ON flexible_report_snapshots
BEGIN SELECT RAISE(ABORT,'immutable_flexible_snapshot'); END;
-- Real readiness cannot change or convert the existing synthetic workspace.
CREATE TABLE flexible_workspace_scope (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), purpose TEXT NOT NULL CHECK(purpose='real_experiment')
);
CREATE TRIGGER immutable_flexible_workspace BEFORE UPDATE ON flexible_workspace_scope
BEGIN SELECT RAISE(ABORT,'immutable_workspace_scope'); END;
CREATE TRIGGER separate_flexible_workspace BEFORE INSERT ON flexible_workspace_scope
WHEN EXISTS(SELECT 1 FROM comparison_workspace_scope) OR EXISTS(SELECT 1 FROM tasks WHERE json_extract(metadata,'$.product')='synthetic')
BEGIN SELECT RAISE(ABORT,'separate_store_required'); END;
CREATE TRIGGER separate_synthetic_workspace BEFORE INSERT ON comparison_workspace_scope
WHEN EXISTS(SELECT 1 FROM flexible_workspace_scope)
BEGIN SELECT RAISE(ABORT,'separate_store_required'); END;
CREATE TRIGGER flexible_real_task_insert BEFORE INSERT ON tasks
WHEN EXISTS(SELECT 1 FROM flexible_workspace_scope) AND (NEW.metadata IS NULL OR COALESCE(json_extract(NEW.metadata,'$.schema_version'),1)!=2 OR json_extract(NEW.metadata,'$.product')='synthetic')
BEGIN SELECT RAISE(ABORT,'real_store_required'); END;
CREATE TRIGGER flexible_real_task_update BEFORE UPDATE OF metadata ON tasks
WHEN EXISTS(SELECT 1 FROM flexible_workspace_scope) AND (NEW.metadata IS NULL OR COALESCE(json_extract(NEW.metadata,'$.schema_version'),1)!=2 OR COALESCE(json_extract(NEW.metadata,'$.product'),'') NOT IN ('codex','claude_code'))
BEGIN SELECT RAISE(ABORT,'real_store_required'); END;
CREATE TRIGGER preserve_synthetic_workspace BEFORE DELETE ON comparison_workspace_scope
BEGIN SELECT RAISE(ABORT,'immutable_workspace_scope'); END;
CREATE TRIGGER preserve_real_workspace BEFORE DELETE ON flexible_workspace_scope
BEGIN SELECT RAISE(ABORT,'immutable_workspace_scope'); END;
