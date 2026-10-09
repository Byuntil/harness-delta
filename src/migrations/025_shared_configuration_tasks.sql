-- Opaque reservation exists before task preparation so every reader fails closed.
CREATE TABLE IF NOT EXISTS shared_configuration_tasks (
 task_id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 settings_hash TEXT NOT NULL CHECK(length(settings_hash)=64),
 setup_hash TEXT NOT NULL CHECK(length(setup_hash)=64)
);
CREATE TRIGGER IF NOT EXISTS delete_shared_configuration_task AFTER DELETE ON tasks
BEGIN DELETE FROM shared_configuration_tasks WHERE task_id=OLD.id; END;
