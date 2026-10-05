# Prepare a small functional task pilot

Use this workflow to check whether the assigned task CLI is useful on real work,
with descriptive partial costs. It does not establish cost savings, full task
cost or statistical effectiveness. Follow [R01–R05/R09/R10](../requirements.md) and
the [native workflow](task-native-workflow.md); existing source, cost and inference
gates apply unchanged. No model runs merely because inputs are prepared.

## Reuse existing inputs

Keep the actual project root, instruction artifacts, task prompts, decisions and
execution requests under the ignored `.harness-delta/` directory. Reuse the
project's existing shared instructions for both arms; propose only one small
additional task procedure for B. Hash the exact artifact bytes with the existing
`selectedArtifactSnapshot` manifest formula: sort entries by `artifact_id`, then
SHA-256 the JSON array of `{artifact_id, sha256}` entries. Persist IDs/hashes, not
instruction text, in variant or measurement records. Review the actual A/B content
before declaring either variant eligible or registering immutable variants.

Use the existing v2 variant/protocol/assignment schemas from
[flexible comparison](flexible-comparison.md). Keep user decisions outside the
strict protocol JSON. An incomplete protocol is a valid draft but cannot freeze;
registration is immutable, so finalize it before registering the real protocol.
A temporary validation store may check that an incomplete draft rejects freeze;
that store must not become the real allocator.

For the smallest initial scope, select only Codex 0.160.0
`codex-workflow-own-response-v1`. Parent-only continuation can retain one task's
assignment. `codex-workflow-direct-child-v1` is a separate read-only profile and
cannot resume its family. The schema allows one profile per product/version; do
not list both in one protocol. Claude ordinary workflow remains blocked. Runtime
model/effort are developer choices; a recommended invocation pair is not a
harness policy. Use one immutable price table and legacy input basis for both
arms, and leave unpriced components unavailable.

## Define one useful task first

Specify a small actual output and objective human acceptance before allocation.
For example, ask for a short file explaining where the existing task-cost report
excludes observations, how its cutoff works and why complete cost remains null.
Each acceptance item must be checkable against named code paths. Keep code-bearing
answers in the ordinary work product, outside measurement storage, fixtures,
exports and measurement reports.

Ordinary workflow discards native stdout. A read-only analysis request therefore
does not produce a human-reviewable answer through this CLI. Use an explicitly
approved root workspace-write invocation when the task should save a work product;
include the output destination and allowed edits in its private prompt. The root
input supports workspace-write, but existing native qualifications were read-only.
Treat this first write-mode run as new supervised operational evidence. Do not
extend child permissions or add a measurement output channel for response text.

A draft of four distinct tasks, one assignee and two balanced allocation blocks
can bound a later functional batch. The owner must accept those values. Start
with one approved task and do not implement the same logical task under both
variants. Sample size is a feasibility budget, not statistical power. Failures,
not-started tasks and missing outcomes remain in their original arm.

## Resolve decisions before execution

Present the proposed A/B difference, task/criteria, immutable price basis and
protocol choices together. Select v2 `purpose: functional_pilot` and omit
`minimum_effect`, `quality_margin` and `confidence_level`; the schema rejects
these inputs for this purpose. Recruitment dates, followup, planning basis,
missingness limits and analysis/sensitivity labels remain required operational
settings. Use descriptive labels rather than claiming an approved inferential
method. No dummy statistical values are needed. A complete accepted protocol
still must freeze before recruitment, with eligible artifacts and an immutable
price table. Exact production source gates apply before allocation or execution.

Functional comparison reports explicitly mark `purpose: functional_pilot`,
`evaluation_status: functional_only`, `adoption.status: not_applicable` and
`functional_pilot_only`. Task costs, partial arm means, counts and human outcomes
remain descriptive. Primary arm complete means and relative change remain null
even if hypothetical complete facts are supplied. Inference cannot be enabled by
source or analysis evidence for this purpose. Existing real experiments retain
all their effect inputs and validation requirements. A frozen protocol cannot be
relabeled into an effectiveness study; create a separate prospective accepted
protocol after method validation. Current file exchange excludes this purpose.

Verify schemas and hashes offline with no real allocation or product launch. Use
existing synthetic regressions for assignment reuse, drift, scope rejection,
collection/stop, replay and null complete cost; add a test only for a reproduced
implementation defect. Consolidate full checks and independent review at the
final implementation batch under the contributor workflow.

After accepted inputs are finalized, prepare a fresh exact execution request.
Include the project/task and source profile, pinned binary and implementation
hashes, selected artifact manifests, runtime choice, sandbox, work-product path,
launch/resume count, timeout, no-retry rule and teardown. Obtain new actual-model
approval before `workflow codex launch`. Old qualification approvals are consumed.
Timeout bounds local supervision, not provider requests, tokens or subscription
spending. Do not change login, install a product or update global settings.

## Execute and assess only after approval

Use a new dedicated real store. Register the project, accepted price table and
variants, then register/freeze the accepted protocol using existing commands.
Freeze before recruitment and check readiness. Use `workflow codex launch` with
the accepted task configuration; assignment commits before selected artifact
reads. Use fresh run/confirmation IDs for later operations, the same canonical
logical task for legitimate attempts and no retrospective collection.

After native completion, review the ordinary work product separately. A process
exit or positive usage does not finalize the human task. Reopen/collect only the
linked admitted sources before human finalization, stop foreground collection,
and verify replay adds zero usage/runtime rows. Complete human criteria with
`workflow finish`, then create an explicit fixed-cutoff report and task partial
price estimate as described in [observed cost](observed-cost.md). A cutoff is
exclusive; use a later valid time rather than the exact finalization instant.

Stop on scope loss, manifest drift, unsupported version/topology, ambiguous or
double usage, deadline, privacy exposure or failed teardown. Preserve failed or
aborted outcomes and independently observed partial usage. No automatic retry,
reassignment or backfill. Unpriced runtime choices remain unavailable rather than
being replaced silently.

Report functionality, human outcome, assignment/runtime evidence, partial
priceable observations and coverage limitations. Complete amount remains null
and inference unavailable. A few tasks do not establish a cost-saving winner.
Commit/PR approval and remote CI are separate from actual-model approval; no
publication follows automatically from preparing or executing this packet.
