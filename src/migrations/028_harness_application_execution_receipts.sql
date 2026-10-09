-- Process ownership is bounded control metadata, never protocol/session content.
-- Orphan proof outlives task deletion solely to verify independent teardown.
CREATE TABLE harness_application_owners (
 job_id TEXT PRIMARY KEY,
 proposal_hash TEXT NOT NULL, runtime_hash TEXT NOT NULL, launch_nonce_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('reserved','running','verified','blocked')),
 snapshot TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE harness_application_execution_receipts (
 job_id TEXT PRIMARY KEY REFERENCES harness_application_jobs(id) ON DELETE CASCADE,
 proposal_hash TEXT NOT NULL, runtime_hash TEXT NOT NULL, profile_id TEXT NOT NULL,
 product TEXT NOT NULL CHECK(product IN ('synthetic','codex','claude_code')),
 setup_identity_hash TEXT NOT NULL, receipt_hash TEXT NOT NULL, manifest_hash TEXT NOT NULL,
 created_at TEXT NOT NULL
);

-- Completed orphan proof has no remaining teardown purpose.
CREATE TRIGGER purge_verified_application_owner_after_job_delete
AFTER DELETE ON harness_application_jobs BEGIN
 DELETE FROM harness_application_owners WHERE job_id=OLD.id AND state='verified';
END;
