# Support and evidence

The helper uses the loopback UI transport:

| Route | Use |
| --- | --- |
| `GET /api/bootstrap` | Registered projects and prepared tasks; CSRF retained only in memory |
| `GET /api/tasks/:id` | Assignment, lifecycle, support, sanitized family identities/counts and partial usage |
| `POST /api/tasks/:id/session-connect` | Product and native receipt; resolve identity/source, confirm binding and start observation |
| `POST /api/tasks/:id/session-picker` | Legacy explicit source selection without reading source contents |
| `POST /api/tasks/:id/connect` | Legacy ticket verification with source handle |

Mutations use Origin, X-Harness-CSRF, Idempotency-Key and If-Match. Redirects
and non-loopback origins are rejected. Server state wins after restart/deletion.
The helper checks the assignment and re-reads durable binding after connection.
Support/version labels are informational; exact admission is server-owned. A UUID,
filename, cwd, model statement or environment hint is not current-session proof.
All usage stays partial; complete cost and inference remain unavailable.

## Receipt path and installation boundary

The shared API/service and both platform providers are implemented and exercised end to
end with isolated synthetic fixtures. Shipped production admission rejects ordinary
hook-bound sources before identity resolution or transcript reading. Configuring
a provider does not lift that gate. Claude uses the candidate native transcript
profile with verified root-family membership; nested members are flattened because
their direct parent is not available in documented hooks.

The Codex proposal helper returns a project-only `.codex/hooks.json` value.
The standalone recorder persists only allowlisted native lifecycle metadata in a
private local directory and adds the opaque receipt to native developer context.
Canonical source proofs are retained privately across receipt renewal/restart.
Pinned SubagentStart supplies its own child rollout path; shared session_id is
the root family ID. The provider resolves and verifies immediate parent/depth
from that exact file's first metadata envelope. This code path is implemented and
synthetic-tested; actual hook/source conformance remains unqualified.
It does not install or trust itself. Review existing hooks, exact executable/script,
receipt directory, approved transcript roots and project before installation.
Applying/trusting instrumentation, opening or resuming at the startup boundary,
and native qualification require explicit authorization. Do not bypass trust,
change authentication, add global hooks or enforce model/effort.

The provider verifies native child relations before usage reads. The coordinator
follows supported descendants automatically. Defaults: depth 8, 32 family members,
1,024 receipts, 8 MiB per source, 64 native turns and a 64 KiB metadata header.
Limits and unsupported inherited pagination produce gaps. See the
[binding design and qualification plan](../../../docs/decisions/012-session-family-bindings.md).

Pause/server restart stops observation. Reconnect once in the parent for a new
baseline without historical backfill. New parents retain task, arm and price pin
within the original window. A child created inside observation retains its first
own request even if completed before discovery. Global native request IDs prevent
replay and parent/child double counting. Human completion remains required.

## Legacy ticket path

The legacy helper verifies source handle/UUID, native developer context, fresh
root evidence and connection window. It confirms only the latest selected source.
Observation starts separately in the UI; automatic family collection is unsupported
in this path. The existing CLI alternative is `workflow external connect` with
reviewed config/runtime/spec/execution inputs, a ticket and explicit database.
Do not create a database, launch a model, apply files or scan logs as a fallback.

Claude project-local skill frontmatter registers PreToolUse/SubagentStart/Stop
hooks upon explicit invocation. Hook commands use `CLAUDE_PROJECT_DIR` and the
project `.claude/skills/harness-connect` installation. `${CLAUDE_SKILL_DIR}` is not
assumed to expand in hook commands. No permission allowlist, global hook or settings
change is supplied. Review installation/trust before use. `CLAUDE_CODE_SESSION_ID`
narrows same-command locator candidates, but a fresh hook receipt matching OS
process ancestry and server-validated source remains required. Missing/ambiguous
metadata blocks. Child re-calls only confirm independently discovered active members;
paused children require parent reconnect. Live loading and source conformance are
unverified. Claude hooks can continue recording metadata while the collector is
paused; deletion queues metadata-only forgetting durably and blocks later receipts.
The exact registered project root is passed to each task-specific provider, never
inferred from a profile, unrelated cwd or home-directory scan.

Official identity/discovery fields do not prove live skill loading or source
compatibility. Codex environment and Claude skill substitutions are hints only:

- [Codex hooks and metadata](https://learn.chatgpt.com/docs/hooks)
- [Codex skills](https://learn.chatgpt.com/docs/build-skills)
- [Claude skills and substitutions](https://code.claude.com/docs/en/skills)

Tests use synthetic fixtures and no actual native model execution.

Claude baselines preserve up to 1,024 distinct excluded own request IDs independently
of live replay history. Over-capacity (`claude_baseline_limit`) or partial/unreadable
(`claude_baseline_incomplete`) baselines stop connection instead of silently losing
exclusions. Already observed counter conflicts stop collection.
