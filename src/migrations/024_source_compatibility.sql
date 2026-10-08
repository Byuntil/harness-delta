CREATE TABLE session_source_compatibility (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  payload TEXT NOT NULL CHECK(json_valid(payload))
);
CREATE TRIGGER immutable_session_source_compatibility
BEFORE UPDATE ON session_source_compatibility
BEGIN SELECT RAISE(ABORT, 'immutable_source_compatibility'); END;
CREATE TABLE source_compatibility_blocks (
  product TEXT NOT NULL CHECK(product IN ('codex','claude_code')),
  product_version TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('file','codex_workflow','claude_workflow')),
  reason TEXT NOT NULL CHECK(reason IN ('contract_failed','semantic_incompatibility')),
  PRIMARY KEY(product, product_version, source)
);
