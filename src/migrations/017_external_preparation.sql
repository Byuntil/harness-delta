-- Operational preparation only; immutable comparison assignment/deadline stays intact.
CREATE TABLE external_preparations (
  task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision TEXT NOT NULL,
  configuration_digest TEXT NOT NULL,
  active_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('assigned','preparation_needed','applying','configuration_verified','waiting_connection','connected','measuring','stopped','configuration_changed','recovery_needed','released')),
  prepared_at TEXT NOT NULL,
  first_connected_at TEXT,
  reason_code TEXT
);
CREATE TABLE external_surface_leases (
  surface_key TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES external_preparations(task_id) ON DELETE CASCADE
);
CREATE TRIGGER immutable_external_first_connection BEFORE UPDATE OF first_connected_at ON external_preparations
WHEN OLD.first_connected_at IS NOT NULL AND NEW.first_connected_at IS NOT OLD.first_connected_at
BEGIN SELECT RAISE(ABORT,'immutable_external_first_connection'); END;
