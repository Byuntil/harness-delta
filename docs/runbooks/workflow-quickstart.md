# First A/B workflow run

[한국어](workflow-quickstart.ko.md)

This page walks through one assigned task from setup to report with the admitted
Codex 0.160.0 root profile (`codex-workflow-own-response-v1`). It shows the order
of commands and what each output means. The detailed contracts and limits stay in
the [native workflow runbook](task-native-workflow.md), the
[flexible comparison runbook](flexible-comparison.md) and the
[functional pilot guide](functional-task-pilot.md). Usage is always partial: no
command here produces a complete task cost, savings claim or adoption decision.

Every real product launch needs your explicit approval of that run. Preparing files
and running `workflow status` or `workflow task` never starts a product.

## The timeline that decides whether an outcome counts

```text
assign/launch ──► work (launch, resume, collect) ──► finish ──► followup_ends_at ──► report
                                                     │                                │
                                     must happen BEFORE the deadline     cutoff at or AFTER the deadline
```

- Assignment sets a fixed `followup_ends_at` = assignment time + the protocol's
  `followup_seconds`. Pause, resume and rework never move it.
- `workflow finish` must happen **before** `followup_ends_at`. A later outcome is
  stored, but the report shows `outcome_missing` (or `not_started` if the task never started
before the deadline) for that task and lists the outcome
  separately as `late_outcome`. `finish` warns with
  `assessment_after_followup_deadline` when this happens.
- A report with a cutoff **before** the deadline shows `followup_pending`, even for
  finished tasks. For final outcomes, create the report once the deadline has passed,
  with a cutoff at or after it. A cutoff cannot be in the future.

Choose `followup_seconds` long enough to cover the work and the human review.

## 0. Prerequisites

- Node.js 24, then `npm ci` and `npm run build` in this checkout.
- Codex 0.160.0 whose binary SHA-256 matches the pinned value in
  [`examples/workflow/launch.json`](../../examples/workflow/launch.json).
- A dedicated real database, for example `.harness-delta/pilot/local.sqlite`.
  Keep databases, prompts and instruction files under the Git-ignored `.harness-delta/`.

Commands below use `hm` for `node dist/cli.js --db .harness-delta/pilot/local.sqlite`.

## 1. One-time protocol setup

Write the price table, both variants and the v2 protocol as described in
[flexible comparison](flexible-comparison.md), with source profile
`{"product":"codex","product_version":"0.160.0","profile_id":"codex-workflow-own-response-v1"}`.

```sh
hm project add project-1 --root /absolute/path/to/project
hm price-table register --config prices.json
hm variant register --config variant-a.json
hm variant register --config variant-b.json
hm comparison register --config protocol.json
hm comparison freeze pilot-1
hm workflow status pilot-1
```

`workflow status` lists blockers. `native_source_unqualified` or
`native_adapter_not_wired` means native runs cannot start yet;
`whole_task_cost_unconfirmed` and `analysis_unverified` are expected and do not block a run.

## 2. Per-task files

Copy the [example files](../../examples/workflow/) and edit them:

| File | Purpose | Change per operation? |
| --- | --- | --- |
| `workflow.json` | Assignment (task, protocol, criteria) and the A/B instruction files | No; reuse it |
| `runtime.json` | Model and effort for this run; `null` means unspecified | Only if you change them |
| `launch.json`, `resume.json`, `collect.json` | Binary, Codex home, recorder, prompt, sandbox, timeout | New `run_id` every time |

Artifact paths in `workflow.json` are resolved from the directory you run the command
in, not from the file's location. `confirmation_id` must be new for every operation. Instead of editing
`workflow.json`, pass `--confirmation <new-id>` on each command.

## 3. Launch

```sh
hm workflow codex launch --config workflow.json --runtime runtime.json \
  --execution launch.json --confirmation confirmation-1
```

Before anything is assigned, the CLI checks the binary hash, the hook recorder,
the prompt file and the Codex home. If one fails, it prints a code such as
`binary_mismatch` with a hint. The task is not assigned, not started and no time
is counted. Fix the file and run the same command again.

If the product cannot be launched for a reason found after these checks and this command
started the task, the task is paused again so no active time accrues; the receipt shows
`activation_reverted: true`.

The receipt prints IDs and hashes only, plus `adapter_result`:

- `state: completed` — the run ended and its own usage was collected.
- `state: failed` — see `reason` and `diagnostic`; the command exits with `codex_workflow_failed`.
- `state: stopped` — stopped on request.

## 4. Check the task at any time

```sh
hm workflow task task-1
```

It shows the state, `followup_ends_at`, whether follow-up is still `open`, the outcome
and whether it counts, every run, and `next_actions`:

| Next action | Meaning |
| --- | --- |
| `launch` | Assigned but not started |
| `continue_with_launch_or_resume` | Paused (for example after a failed launch); the next launch or resume reactivates it |
| `finish_before_followup_deadline` | Keep working; record the outcome before the deadline |
| `finish_now_outcome_excluded_after_deadline` | Deadline passed; an outcome is still stored but will not count |
| `stop_or_recover_running_run` | A run is still marked running (see step 6) |
| `report_after_followup_deadline` | Finished; wait for the deadline before the final report |
| `create_report` | Finished and the deadline passed |

## 5. Continue the same task

Use a new `run_id` and confirmation ID each time; the assignment never changes.

```sh
hm workflow codex resume --config workflow.json --runtime runtime.json \
  --execution resume.json --confirmation confirmation-2
```

`resume.json` needs the `session_id` from the launch receipt. Use `link` and
`collect` for a session you started outside the CLI; see
[the native workflow runbook](task-native-workflow.md).

## 6. Stop or recover a run

```sh
hm workflow codex stop run-3      # ask a live run to stop
hm workflow codex recover run-3   # the process is gone (crash, kill, reboot)
```

A run left `running` after its collector disappeared blocks new runs with
`workflow_run_active`. `recover` marks it `failed` with reason `abandoned` and records
an observation gap for the unobserved time. It never adds usage. Recover before you
pause or finish the task: an inactive task cannot record the gap, and the result then
shows `gap_warning: task_not_active`. A harness-delta collector that is still alive
stops at its next check. The Codex process itself runs in its own process group and can
outlive a killed collector; `recover` cannot signal it, so end any leftover Codex
process yourself.

## 7. Finish

```sh
hm workflow finish task-1 --outcome success --met criterion-1
```

`success` requires every criterion ID; `failed` and `aborted` accept a subset. The
result shows `followup_ends_at` and `counted_in_deadline_status`.

## 8. Report

After `followup_ends_at` has passed:

```sh
hm workflow report pilot-1 --id report-1 --cutoff 2026-10-12T00:00:00Z --reason initial
```

Per task, `deadline_status` is `success`, `failed`, `aborted`, `outcome_missing`,
`not_started` or `followup_pending`. In reports with descriptive version
`flexible-cost-descriptive-2`, `late_outcome` lists an outcome assessed after the
deadline. Costs are standardized estimates from observed partial usage. They are
not your bill.

## Common error codes

The CLI prints one code per failure and, for common codes, a `hint:` line. Paths,
file contents and producer messages are never printed; other failures show
`input_or_state_error`.

| Code | What to do |
| --- | --- |
| `invalid_command: ...` | A required option or argument is missing; run the command with `--help` |
| `config_file_unreadable`, `*_file_invalid_json` | Check the path and the JSON syntax of that file |
| `invalid_execution` | The execution file does not match its operation; compare it with the examples |
| `binary_mismatch`, `binary_unreadable` | Use the exact Codex 0.160.0 binary and its absolute canonical path |
| `invalid_hook_recorder` | Point `hook_recorder` at the unmodified recorder in this checkout |
| `invalid_prompt`, `unsafe_home` | Use an existing UTF-8 prompt file (≤ 1 MiB) and an existing Codex home |
| `confirmation_conflict` | Pass a new `--confirmation` ID |
| `workflow_run_active` | Wait for, stop or recover the running run |
| `real_experiment_disabled` | Freeze the protocol and check `workflow status` |
| `workflow_manifest_mismatch` | An instruction file changed after its variant was registered |
| `invalid_transition` | The task state does not allow this; check `workflow task` |
| `invalid_criteria` | `success` needs every criterion ID in `--met` |
| `invalid_cutoff` | Use a UTC cutoff that is not in the future |
