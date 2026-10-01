CREATE TABLE exchange_mappings (
 shared_project_id TEXT NOT NULL, protocol_id TEXT NOT NULL, local_project_id TEXT NOT NULL,
 config_json TEXT NOT NULL, PRIMARY KEY(shared_project_id,protocol_id)
);
CREATE TABLE exchange_writers (
 namespace_id TEXT NOT NULL, shared_project_id TEXT NOT NULL, protocol_id TEXT NOT NULL,
 stratum_id TEXT NOT NULL, allocator_id TEXT NOT NULL,
 PRIMARY KEY(shared_project_id,protocol_id,stratum_id), UNIQUE(namespace_id,stratum_id)
);
CREATE TABLE exchange_import_revisions (
 namespace_id TEXT PRIMARY KEY, shared_project_id TEXT NOT NULL, protocol_id TEXT NOT NULL,
 revision INTEGER NOT NULL, cutoff TEXT NOT NULL, evaluated_at TEXT NOT NULL,
 snapshot_sequence INTEGER NOT NULL, received_at TEXT NOT NULL, header_json TEXT NOT NULL
);
CREATE TABLE exchange_import_receipts (
 package_id TEXT PRIMARY KEY, namespace_id TEXT NOT NULL, shared_project_id TEXT NOT NULL,
 protocol_id TEXT NOT NULL, revision INTEGER NOT NULL, digest TEXT,
 kind TEXT NOT NULL, UNIQUE(namespace_id,revision)
);
CREATE TABLE exchange_tasks (
 shared_project_id TEXT NOT NULL, protocol_id TEXT NOT NULL, namespace_id TEXT NOT NULL,
 task_id TEXT NOT NULL, assignment_id TEXT NOT NULL, stratum_id TEXT NOT NULL,
 allocation_index INTEGER NOT NULL, assignment_json TEXT NOT NULL, finalized_at TEXT,
 PRIMARY KEY(shared_project_id,task_id), UNIQUE(shared_project_id,assignment_id),
 UNIQUE(shared_project_id,protocol_id,stratum_id,allocation_index)
);
CREATE TABLE exchange_identity_keys (
 shared_project_id TEXT NOT NULL, key_id TEXT NOT NULL, task_id TEXT NOT NULL,
 protocol_id TEXT NOT NULL, namespace_id TEXT NOT NULL, PRIMARY KEY(shared_project_id,key_id),
 FOREIGN KEY(shared_project_id,task_id) REFERENCES exchange_tasks(shared_project_id,task_id) ON DELETE CASCADE
);
CREATE TABLE exchange_tombstones (shared_project_id TEXT NOT NULL,key_id TEXT NOT NULL,PRIMARY KEY(shared_project_id,key_id));
CREATE TABLE exchange_project_denials (shared_project_id TEXT PRIMARY KEY);
CREATE TABLE exchange_protocol_invalidations (
 shared_project_id TEXT NOT NULL,protocol_id TEXT NOT NULL,reason TEXT NOT NULL,invalidated_at TEXT NOT NULL,
 PRIMARY KEY(shared_project_id,protocol_id)
);
CREATE TABLE exchange_retention_policy (shared_project_id TEXT PRIMARY KEY,days INTEGER NOT NULL);
CREATE TABLE exchange_merge_state (shared_project_id TEXT PRIMARY KEY,revision INTEGER NOT NULL);
