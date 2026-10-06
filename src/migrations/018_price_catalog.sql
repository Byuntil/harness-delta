-- Catalogs are reference metadata only. No usage or actual billing source is added.
CREATE TABLE price_catalogs (
  id TEXT PRIMARY KEY NOT NULL, version INTEGER UNIQUE NOT NULL, hash TEXT NOT NULL,
  artifact_hash TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE TABLE price_catalog_default (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1), catalog_id TEXT NOT NULL REFERENCES price_catalogs(id),
  last_checked_at TEXT NOT NULL, last_success_at TEXT NOT NULL, status TEXT NOT NULL, reason TEXT
);
CREATE TABLE price_catalog_bases (
  price_table_id TEXT PRIMARY KEY NOT NULL REFERENCES price_tables(id), payload TEXT NOT NULL
);
CREATE TRIGGER immutable_price_catalog BEFORE UPDATE ON price_catalogs
BEGIN SELECT RAISE(ABORT,'immutable_price_catalog'); END;
CREATE TRIGGER retain_price_catalog BEFORE DELETE ON price_catalogs
BEGIN SELECT RAISE(ABORT,'immutable_price_catalog'); END;
CREATE TRIGGER immutable_price_basis BEFORE UPDATE ON price_catalog_bases
BEGIN SELECT RAISE(ABORT,'immutable_price_basis'); END;
CREATE TRIGGER retain_price_basis BEFORE DELETE ON price_catalog_bases
BEGIN SELECT RAISE(ABORT,'immutable_price_basis'); END;

CREATE TABLE price_cost_inputs (
  id TEXT PRIMARY KEY NOT NULL, base_report_id TEXT, payload TEXT NOT NULL, hash TEXT NOT NULL
);
CREATE TABLE price_cost_input_dependencies (
  input_id TEXT NOT NULL REFERENCES price_cost_inputs(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY(input_id,task_id)
);
CREATE TABLE price_revaluations (
  id TEXT PRIMARY KEY NOT NULL, input_id TEXT NOT NULL REFERENCES price_cost_inputs(id) ON DELETE CASCADE,
  target_table_id TEXT NOT NULL REFERENCES price_tables(id), payload TEXT NOT NULL
);
CREATE TABLE price_cost_tombstones (kind TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(kind,id));
CREATE TRIGGER immutable_price_cost_input BEFORE UPDATE ON price_cost_inputs
BEGIN SELECT RAISE(ABORT,'immutable_price_cost_input'); END;
CREATE TRIGGER immutable_price_revaluation BEFORE UPDATE ON price_revaluations
BEGIN SELECT RAISE(ABORT,'immutable_price_revaluation'); END;
CREATE TRIGGER deleted_price_cost_input BEFORE DELETE ON price_cost_inputs
BEGIN INSERT OR IGNORE INTO price_cost_tombstones(kind,id) VALUES ('input',OLD.id); END;
CREATE TRIGGER deleted_price_revaluation BEFORE DELETE ON price_revaluations
BEGIN INSERT OR IGNORE INTO price_cost_tombstones(kind,id) VALUES ('revaluation',OLD.id); END;
CREATE TRIGGER price_cost_dependency_removed AFTER DELETE ON price_cost_input_dependencies
BEGIN DELETE FROM price_cost_inputs WHERE id=OLD.input_id; END;
CREATE TRIGGER price_cost_report_invalidated AFTER INSERT ON comparison_report_tombstones
BEGIN DELETE FROM price_cost_inputs WHERE base_report_id=NEW.report_id; END;
