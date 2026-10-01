-- Separate explicit sharing state. Routing and opaque denials survive source deletion.
CREATE TABLE exchange_sources (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), namespace_id TEXT NOT NULL UNIQUE,
 project_id TEXT NOT NULL, protocol_id TEXT NOT NULL, shared_project_id TEXT NOT NULL,
 config_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE exchange_export_identities (
 task_id TEXT PRIMARY KEY, protocol_id TEXT NOT NULL, identity_json TEXT NOT NULL, sealed_at TEXT NOT NULL
);
CREATE TABLE exchange_export_receipts (
 package_id TEXT PRIMARY KEY, namespace_id TEXT NOT NULL, revision INTEGER NOT NULL,
 request_json TEXT, metadata_json TEXT, digest TEXT, invalidated INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE exchange_source_tombstones (key_id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL);
CREATE TABLE exchange_scope_notices (kind TEXT PRIMARY KEY, target_id TEXT NOT NULL, reason TEXT NOT NULL, invalidated_at TEXT NOT NULL);
