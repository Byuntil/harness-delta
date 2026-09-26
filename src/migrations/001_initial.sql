CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  local_root TEXT,
  retention_days INTEGER CHECK (retention_days IS NULL OR retention_days > 0)
);
CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metadata TEXT,
  state TEXT NOT NULL DEFAULT 'registered' CHECK (state IN ('registered','active','paused','finalized')),
  registered_at TEXT,
  started_at TEXT,
  first_completed_at TEXT,
  finalized_at TEXT,
  UNIQUE(id, project_id)
);
CREATE TABLE attempts (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('first','rework')),
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  parent_id TEXT,
  source_path TEXT,
  product TEXT,
  FOREIGN KEY(task_id, project_id) REFERENCES tasks(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY(parent_id, task_id, project_id) REFERENCES sessions(id, task_id, project_id),
  CHECK (parent_id IS NULL OR parent_id != id),
  UNIQUE(id, task_id, project_id)
);
CREATE TABLE events (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  source_key TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  FOREIGN KEY(session_id, task_id, project_id) REFERENCES sessions(id, task_id, project_id) ON DELETE CASCADE
);
CREATE TABLE observations (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('observed','missing','error','excluded','unmeasurable')),
  reason TEXT
);
CREATE TABLE outcomes (
  task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('success','failed','aborted')),
  criteria_met TEXT NOT NULL,
  first_success INTEGER CHECK (first_success IN (0,1)),
  assessed_at TEXT NOT NULL
);
CREATE TABLE baselines (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('randomized_task','observational_period')),
  settings TEXT NOT NULL
);
CREATE TABLE cursors (
  session_id TEXT PRIMARY KEY NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  checkpoint TEXT NOT NULL
);
CREATE TABLE tombstones (
  kind TEXT NOT NULL CHECK (kind IN ('task','project','session')),
  id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY(kind, id)
);
