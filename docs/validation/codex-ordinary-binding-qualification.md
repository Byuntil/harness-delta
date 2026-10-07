# Isolated ordinary Codex binding qualification

This checkout provides a bounded qualification runner for the ordinary interactive
Codex CLI candidate, separate from production admission. Preparation runs no native
product or model. Execution requires explicit consent for the frozen intent and an
interactive terminal. The public command has no synthetic-mode switch.

The exact candidate is Codex 0.160.0 on macOS arm64, binary SHA256
`112fae7a5a1223e673c8a1791d32338f37df8b527ff1159bb8adac6c4dbf1b4b`.
This qualification pins root and both children to `gpt-6.1-sol` / `high`; it does not change
the portable skill's model policy or require contributors to install that version.
A different binary/runtime needs separate qualification. Claude ordinary-session
binding remains a separate candidate; this command does not qualify it.

## Prepare and review

From this checkout, use Node 24 and an existing Python 3 with its standard library.
Build the checkout before preparation. No new Python package is required.

```sh
npm run build
node scripts/codex-session-binding-qualification-command.mjs prepare \
  --directory /private/tmp/harness-delta-binding-qualification-unique \
  --binary /absolute/path/to/reviewed/codex \
  --codex-home /absolute/path/to/existing/codex-home
```

Paths must be canonical (on macOS, `/private/tmp` rather than its `/tmp` alias).
The directory must not exist. Preparation creates a private disposable Git project,
empty baseline commit, installed skill copy, exact hook wrapper/recorder, fresh
measurement/UI stores, and `execution-intent.json`. It registers one draft
functional-pilot task with a fixed assignment and price table. The protocol's
allocation boilerplate does not authorize multiple native runs or statistical use.
Preparation leaves configuration application to the browser, outside the native
120-second clock. Preparation only checks the existing native sessions directory's path; it does not
scan it, read conversations/credentials, or launch Codex.

Review the entire intent and printed ordinary CLI arguments. The intent freezes
binary, Node, Python, independent PTY worker, recorder, installed package tree and
implementation hashes. Execution rechecks those bytes before consuming a one-use
reservation. A changed helper or recorder is drift even when its wrapper is unchanged.
The same reservation cannot be retried; another attempt needs a new reviewed intent.

Before requesting native approval, start the narrow preparation UI:

```sh
node scripts/codex-session-binding-qualification-command.mjs prepare-ui \
  --intent /private/tmp/harness-delta-binding-qualification-unique/execution-intent.json
```

Open `http://127.0.0.1:4319`, select the exact draft task and apply its configuration.
Only that task's Apply action is permitted; no source picker, connection, launch,
extra task or online price refresh is enabled. Stop this server before execution.
The intent stays unreserved and no native process starts. Task creation was done
by preparation, not by this browser click. Execution rejects an unapplied task.

After explicit approval, create a private consent JSON file (`chmod 600`) with:

```json
{
  "intent_sha256": "<exact prepared intent digest>",
  "approval_reference": "<human approval reference>",
  "actual_model_run": true,
  "transient_hooks": true,
  "native_source_reads": true,
  "owned_process_termination": true
}
```

Do not create a consent witness before receiving that approval. In a terminal:

```sh
node scripts/codex-session-binding-qualification-command.mjs execute \
  --intent /private/tmp/harness-delta-binding-qualification-unique/execution-intent.json \
  --consent /absolute/path/to/approved-consent.json
```

The runner opens the ordinary interactive CLI under a controlling PTY, using
transient `-c` SessionStart/SubagentStart hooks and the canonical trusted-hash shape
for those exact session flags. It writes no permanent project hook/trust or global
configuration. Native startup may still require ordinary project/auth approval;
that prompt is not bypassed or evidence of a successful connection. Do not broaden
permissions or change permanent settings to make the smoke succeed.

In the new disposable root, observe the automatically submitted `harness-connect`
input for origin `http://127.0.0.1:4319`, project `qualification-project`, and the
exact prepared `task_id`, followed by the two fresh direct children. Do not submit
another connect or child-creation request. Exit normally after the bounded work
completes. Do no other work. The child does not invoke the skill. The installed helper uses the
native opaque receipt; cwd, guessed UUIDs or model self-report are not identity.
Open that loopback UI to inspect automatic family/partial usage updates.

## Bounds and ownership

### Manual first input in a human terminal

Preparation accepts `--start-mode manual` to freeze an explicitly manual startup.
Omitting the option retains `automatic`. The selected `start_mode` is included in
the intent digest and printed preparation metadata; it cannot be switched at
execute time under the old consent. Old intents without this field parse as
automatic, while their existing implementation-drift checks still apply.

Manual mode removes only the positional startup prompt. The same ordinary TUI,
model/effort, transient hooks, source admission, owned PTY, lease, identity checks,
deadlines and teardown verification apply. It does not execute `codex exec`,
attach to an independently started process, or enable production binding.
The runner submits no initial model prompt. Native startup activity is not
established as zero account usage by this statement.

After fresh exact-intent execution approval and narrow folder-trust approval, the human
starts the existing `execute --intent ... --consent ...` command in their own
interactive terminal with Node24 and `TERM=xterm-256color`. Its inherited stdin
and stdout forward keys and screen output to the owned PTY. The human enters
`$harness-connect` with the exact prepared task/origin and hook-provided receipt;
the UI operator uses Chrome only. Do not enter additional model requests beyond
the approved recipe, reconnect twice, or start extra children. Preparation-mode
selection alone does not approve a model run or trust/configuration change.

Prepare the command, first input, browser and approval before execution. The
120-second deadline starts at reservation, before TUI startup and human typing;
measurement pause does not pause that deadline or change physical usage limits.
Root4/child1each/total6 includes excluded setup and resumed baselines. A human
message is not necessarily one native model request. A connect-confirmation then
separate child-work turn may exhaust these stops before completion; sufficient
budget for this human flow is unverified. Do not treat nine requests as approved
or silently extend limits. Review the exact interaction and new bounds separately
if complete human-flow validation needs more time or requests.

The human controls input, while the owner still stops on its safety/error/deadline
conditions. Chrome measurement pause stops collection without terminating the
agent. Emergency stop revokes the owned qualification; termination confirmation
failure remains a failed trial. After positively verified teardown, `results-ui`
supports human outcome/reload without native source reads.

In automatic mode, the ordinary TUI receives a fixed initial prompt naming the prepared task and
`$harness-connect`, followed by the bounded two-child work. Codex submits this
startup input after session configuration; no long manual composer paste is
required. Preparation prints the exact argv for review and freezes the
implementation bytes. This is still the ordinary TUI, not `codex exec`.
Native submission, skill activation and hook execution must be observed in the
approved trial; source compatibility and synthetic argv checks do not prove them.
Offline late-row regressions use a trusted fixture callback after verified owned
exit and immediately before final projection. This makes the last-tick boundary
deterministic; the public CLI exposes no fixture switch or callback.

The in-process opaque lease is tied to the fresh reserved store/task/project,
assignment, price pin, new root/child identities and deadline. Browser/profile
fields cannot supply it. Native events keep their native product and the runner's
evidence says `real_operations`; controlled Node fixtures say `synthetic`.
Default ordinary production binding remains gated, and existing admitted workflow
profiles are unchanged.

This smoke permits one root, two direct children and depth one as test bounds.
The product still targets multiple verified descendants. Stop limits are root four,
each child one, total six observed own request IDs, and 100,000 input-plus-output tokens
including excluded pre-connect/restart baselines and continued old contexts. Cached input and reasoning
are not added again. The native owner has a 120-second deadline and at most a
five-second teardown budget, with up to two seconds TERM grace followed by KILL. Cleanup
discovery, identity checks and disappearance checks share that original budget.
Queries use its remaining time; exhaustion or query failure leaves termination
unverified. A final nonblocking root reap also runs when polling time is exhausted.
Operating-system scheduling can delay returning the failure result. Observed limits
can overshoot because logs/backend requests are asynchronous. There is no hard
subscription, billing or dollar cap and no guarantee about backend cancellation.

The Python standard-library PTY owner survives observer exit through control-pipe
EOF and enforces its own deadline. It samples only fresh owned descendants' scoped
PID/PPID/PGID/UID/start metadata, never command arguments or unrelated sessions.
It retains the exact parent PID/UID/start identity that established each fresh
descendant, rechecking that parent around admission. Multiple groups are supported
only for these proved descendants. Before a group signal, scoped membership queries
must agree and every returned member must match an established PID/UID/start
identity and its current group. Only a proved current leader permits the group
signal; without a leader, only individually verified members may be signaled.
Unknown members, reused/conflicting identities, failed queries and incomplete
coverage fail qualification. No executable purpose or benign helper role is inferred
from ancestry. This is sampled OS evidence, not an atomic guarantee against every
future unobserved process or backend operation.
It positively checks root exit, all observed groups' disappearance and known members'
disappearance within the unchanged budget. Positively absent identities are not
queried or signaled again; a reused PID is foreign. A proved member changing its
group alone does not force failure. `ownershipVerified` states the proof result;
the historical `escapedMemberObserved` field retains the observation of a non-root
group. Historical failed trials are not reclassified by this prospective contract.
Private evidence distinguishes fixed-deadline termination from observer failure.
It also preserves the first observer stop reason separately from the final result,
and the first background collector error as a fixed allowlisted code or
`unknown_collector_error`. Arbitrary error text, stack traces and source bodies
are never retained; a later termination failure does not erase these diagnostics.
The first monitor stop also retains `stop_witness`: a fixed predicate and the
in-memory root/each-child/total own-request counts, excluded-baseline counts and
input-plus-output tokens. All simultaneously reached limits are listed. A collector
rejecting an over-limit record retains its first attempted counters separately from
the accepted ledger. This does not admit that rejected record, change any limit,
reset authorization, or reread paused sources. Missing witnesses remain null;
measurement rows and these safety counts do not establish whole-account usage.
It retains at most 16 group transitions from already sampled owned-member
PID/PPID/PGID/UID/start metadata, established parent identity and relative sample
time, with an explicit truncation flag. Membership queries are limited to those
observed groups; no command arguments or session content are added. A recorded
group transition does not identify a benign helper or bypass ownership checks.
A failed ownership/teardown check cannot count as a successful run. Unknown escapes
or provider-side work are outside this process proof. UI pause/receiver close alone
is not proof that native work ended.

Normal measurement pause retains the owned CLI and its original wall-clock
watchdog. It closes the active observation interval and prohibits source-body
reads. The separate emergency-stop action terminates the owned native process.
Resume revalidates only the same live owned root's stored receipt, preserves task,
assignment/price pins and cumulative safety ledger, and baselines all known members.
Repeated cycles never reset the native 120-second clock or request/token limits.
A continued pre-baseline context is excluded from measurement and retained as
separate safety metadata on the next authorized active read. Faults still stop the
owner; expected pause gaps remain partial.

Source-derived safety counters cannot be monitored while paused. Resume baselines
or final active-source reconciliation include excluded requests in safety bounds.
If the CLI exits while paused, no final body read is allowed: evidence reports
`safety_usage_verification: unverified` and `task_paused_no_source_read`. No hard
counter/billing guarantee is claimed. A smoke may pause/resume without issuing
extra work during pause; that proves UI transitions, not actual paused-usage exclusion.

The collector reads only exact new hook-supplied sources in the frozen root scope:
one root plus two child files, with the metadata ceiling checked before any
fourth header/body read (including conflicting receipt renewals); first header at
most 64 KiB, each source at most 8 MiB. It never scans old transcripts
or queries the native state database. After owned termination, a separate provider
projection of those exact three sources checks identity/ancestry, final gaps, every
own request's model/effort/counters, request/token bounds, and agreement with stored
observations or explicitly excluded baseline IDs. Late unmatched usage fails;
pre-connect baseline usage stays excluded from measured usage. No prompt, response,
source code or raw rows enter measurement/report diagnostics.

`evidence.json` records fixed failure reasons, phase, source/counter reconciliation,
family counts and verified process result. It is immutable and private. Human
completion remains separate. After positively verified teardown, reopen only
source-free records and human outcome actions:

```sh
node scripts/codex-session-binding-qualification-command.mjs results-ui \
  --intent /private/tmp/harness-delta-binding-qualification-unique/execution-intent.json
```

Per-session and sum rows show eligible own requests, input/output and pinned partial
estimated cost. Missing, observed zero and unpriced values remain distinct. This
results server cannot read native sources, launch or reconnect. Refreshing it
retains the recorded outcome.  A successful first smoke attests only this exact CLI
root/direct-child acquisition case: it does not admit production, wider topology,
Claude, IDE/MCP/system agents, complete cost or inferential adoption decisions.

## Local verification

Measurement pause stops binding collection before writing interval diagnostics.
If a clock regression prevents a valid gap or lifecycle transition, bindings stay
stopped with an unknown interval, the operation reports its error, and the task
may still display its previous lifecycle state. No timestamp is clamped and no
interval is backfilled. Retry the pause after resolving the clock error before
reconnecting. An in-flight read or child discovery cannot restore collection.
Normal measurement pause keeps the owned agent alive; the qualification owner's
separate deadline and emergency/fault controls still apply.

Lease generation and family pins are adopted only after the corresponding binding
transaction commits. Failed binding writes cannot advance those pins. Qualification
evidence retains the first fixed diagnostic stage/code separately from overall
termination failure; arbitrary error messages and stacks are excluded.

The measurement product has no four-request limit. The qualification owner stops
at observed root4, total6 or 100000 input/output tokens, including excluded setup
requests. These are conservative stop thresholds, not promises that every workflow
within those counts will complete. The collector can accept the boundary record
while the next owner monitor sample stops execution. The fixed prompt's "within
four" instruction does not remove that stop rule or establish a minimum native
request path. A different trial budget/interaction recipe requires separate review
and approval; do not change `>=` to `>` to claim native success.

An independently started human terminal currently cannot issue this qualification
lease. Real ordinary binding remains gated to the existing isolated owner and
frozen one-use intent. Human terminal operation through that owner would retain
its fixed initial prompt, stop thresholds and verified cleanup; it is not a
general user-managed-terminal admission or a way to bypass production gates.

Before native approval, run harmless fixtures on Node 24:

```sh
npm test -- tests/owned-cli-invocation.test.ts \
  tests/codex-session-binding-qualification.test.ts \
  tests/session-binding-service.test.ts tests/session-binding-api.test.ts
npm run lint
npm run typecheck
npm run build
```

The fixtures use Node payloads and fresh synthetic transcripts through the actual
recorder, portable helper, loopback server and leased collector. They cover positive
controlling-terminal behavior, ignoring/escaped children, observer exit, deadline,
replay/consent/package drift, excluded baseline and late requests/runtime/token/gap
writes. They make no native/model calls and do not establish native qualification.
Independent review is required under the repository workflow.

See [source acquisition evidence](codex-ordinary-hook-source-acquisition.md),
[the portable runbook](../runbooks/harness-connect.md), and
[the binding decision](../decisions/012-session-family-bindings.md).
