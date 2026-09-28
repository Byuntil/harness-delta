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
