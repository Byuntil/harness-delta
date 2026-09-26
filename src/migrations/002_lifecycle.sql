ALTER TABLE tasks ADD COLUMN first_success INTEGER CHECK (first_success IN (0,1));
ALTER TABLE tasks ADD COLUMN generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN last_transition_at TEXT;
CREATE TABLE active_intervals (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE UNIQUE INDEX one_active_interval ON active_intervals(task_id) WHERE ended_at IS NULL;
ALTER TABLE sessions ADD COLUMN product_version TEXT;
