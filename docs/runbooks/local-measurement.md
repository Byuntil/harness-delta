# Local measurement

[한국어](local-measurement.ko.md)

Requires Node.js 24. Build with `npm ci && npm run build`; use `node dist/cli.js`
from this checkout, or `hm` from an installed local package. Installation does
not collect anything. This preview produces **partial observations**, not complete
task usage or adoption decisions. See [capabilities](../decisions/001-adapter-capabilities.md).

## Register and link

Choose opaque identifiers and fixed criterion IDs before work starts. Local root
and source paths are configuration; they do not enter reports. Replace the example
paths, model, session ID and version with the actual values for your dedicated session.

```sh
node dist/cli.js --db local.db project add project1 --root /path/to/project
node dist/cli.js --db local.db task register task1 --project project1 --type feature --size small --assignee user1 --product codex --model MODEL_ID --criteria criterion1
node dist/cli.js --db local.db task start task1
node dist/cli.js --db local.db session link SESSION_ID --task task1 --source /path/to/exact-session.jsonl --product codex --version 0.156.1
node dist/cli.js --db local.db collect --task task1
```

`--version` must be the exact registered version for that product.

Only explicit linked files are opened, after registered/active scope is checked.
No global transcript discovery occurs. The first poll establishes a baseline.
**Begin a new prompt/turn after collection starts.** A turn already running at
startup, restart or resume is excluded, including its later tool completions.
Keep collection running while working. Ctrl-C/SIGTERM stops it; nothing runs in
the background afterward. `--once` establishes a baseline and exits; repeatedly
invoking it does not measure work between invocations.

In another terminal, use `task pause task1` and `task resume task1`. Resuming starts
a new baseline at the next poll. Stopping/restarting never backfills offline work.
Finalize only after the last source events have arrived and been collected.

## Assess, report and delete

```sh
node dist/cli.js --db local.db task first-complete task1
node dist/cli.js --db local.db task assess-first task1 --result failed
node dist/cli.js --db local.db task rework task1
node dist/cli.js --db local.db task finalize task1 --outcome success --met criterion1
node dist/cli.js --db local.db report task task1 --cutoff 2030-01-02T12:00:00Z --format json
node dist/cli.js --db local.db delete task task1
```

Supply your actual report cutoff, not the illustrative date. Human outcome and
criterion fulfillment are explicit; a passing test never finalizes a task.
Finalization is immutable. A new requirement belongs in a new task.

Reports show observed token components and partial sums, outcome, rework, elapsed
and active time, plus known command/Bash executions. Cached inputs are subsets of
normalized total input; do not add them again. Complete totals, general tool-failure
counts, model runtime, cost, search/read classification, duplicate reads, context
expansion, and first edit/test/oracle times remain null where unsupported. Missing
is not zero. A first explicit Codex cumulative zero is retained when eligible;
repeated unchanged cumulative notifications are not new observations. Baseline
and uncertain-interval exclusions still apply. Claude message replay keeps its
original attribution; conflicting metadata remains an error. See the
[diagnostic categories](../decisions/003-local-observation-contract.md#collector-failure-diagnostics)
for the local collector interface and its limits.

Retention is opt-in: `retention set project1 --days 30`, then `retention apply
project1`. It deletes finalized tasks by finalization age and retains active tasks.
`delete project project1` removes its tasks and related rows. Tombstones prohibit
identifier reuse. Prior report files and original product transcripts are outside
local DB deletion; import/sync deletion guarantees belong to later delivery gates.

## Preregister an observational period

Copy [the period example](../../examples/period.json), set future windows and all
eligibility fields, and register before the first window starts:

```sh
node dist/cli.js --db local.db period register --config period.json
node dist/cli.js --db local.db report period period1 --cutoff 2030-03-01T00:00:00Z --format markdown
```

Settings are immutable and versioned. Cohorts use task start in half-open windows
`[start,end)`, not completion date. Each task is followed for the specified hours;
results after its follow-up cutoff are excluded. Reports remain provisional until
the second enrollment window plus follow-up has ended. Composition and all eligible
outcomes remain visible, including failures, abandonment and missing usage.
Complete means/change rates remain unavailable while coverage is partial.
JSON and Markdown contain the same snapshot and a metadata-only fingerprint.
The same DB data, settings and cutoff reproduce the same period report. Preserve
the generated report if you need a historical snapshot after deletion or new data.

## Versions, conformance, and update controls

Registered file adapters are partial. They currently accept Codex CLI 0.156.1 and Claude Code 2.1.283 only. An unregistered version, range, or suffix is rejected before the file is read and is not stored. Codex 0.158.0 is not registered. See [ADR 007](../decisions/007-adapter-version-profiles.md).

The repository runner at `scripts/conformance/` is manual. Installation, collection, hooks, and CI do not invoke it. CI runs offline synthetic unit tests of the report projector, the candidate parser, the confirmation and hook-trust helpers, and the exec-stream reducer. CI never runs the runner. Design approval is not live-run approval.

To run the Codex 0.158.0 exec conformance check after approving its live protocol, compile the scripts into the ignored cache and start the runner from the repository root in an interactive terminal:

```sh
npx tsc -p tsconfig.conformance.json
node node_modules/.cache/conformance/scripts/conformance/runner.js --out "$PWD/.harness-delta/work/<work-id>/live"
```

The runner prints its plan and starts no product process until you type `confirm`; there is no option that skips this. It refuses a non-interactive terminal, a set `CODEX_HOME`, and an output directory outside `.harness-delta/`. It checks `codex --version` before and after, runs one `codex exec` turn and one exact-session resume with synthetic prompts, locates the rollout by the exec-stream thread ID, and cross-checks a per-invocation SessionStart hook. It writes a restricted report of check outcomes, counts and catalog key names, without IDs, paths, text or token values. The rollout file it creates contains the synthetic prompts, replies and instructions and is left in place. The manual suite `npx vitest run --config scripts/conformance/vitest.config.ts` exercises the runner against a synthetic stand-in, not a product.

The per-invocation hook override is observed to work for `codex exec` 0.158.0. Source review indicates that an interactive Codex start which connects to an already running app-server daemon does not pass per-invocation hook configuration to that daemon; a control run was consistent with this but did not prove it. Interactive linkage remains unsupported.

Before an experiment, verify update controls against the pinned binaries. Freeze the product, application, executable provenance, and model/settings. Use process-only controls and do not edit config files. Codex's documented one-off override is `-c check_for_update_on_startup=false`. Claude's documented process environment is `DISABLE_AUTOUPDATER=1`. `DISABLE_UPDATES=1` also blocks manual updates. These are documentation findings dated 2026-09-29, not pinned-binary runtime verification. Check versions before and after the run. On drift, stop measurement, mark uncertainty, and follow the frozen deviation policy. Do not relink, backfill, or rerandomize. This checklist does not enable R09 and does not waive R10.

## Recovery and limits

Errors use fixed codes. Source identity changes, truncation, invalid scope/version,
conflicting metadata, resets or unsupported topology exclude the uncertain batch.
Stable same-size Claude modifications retain the baseline only when validated
measurement metadata is identical; changed usage, origin, model, timestamp or
recognized tool IDs still fail closed. This does not establish raw-content equality.
Earlier observations remain partial. Correct the explicit mapping and restart;
recovery establishes a new baseline and does not import earlier work. Sources over
16 MiB are unsupported in this initial bounded reader. It scans a bounded authorized
snapshot per poll; this is not an unbounded production log tailer.

Run `npm run check` for synthetic acceptance tests, including the CLI flow, privacy
sentinel, rollback, pause/restart and reports. Actual evidence currently covers
macOS arm64, Codex CLI 0.156.1 and Claude Code 2.1.283 only. App sessions,
parent/child complete accounting, nonzero reasoning semantics, other versions and
other platforms need separate validation. Do not use this preview for a real
experiment or inferential adoption decision.
