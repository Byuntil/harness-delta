# Repository Instructions

## Start and resume

- Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [development workflow](docs/development/workflow.md).
- Identify the user-approved task, acceptance criteria, and stopping point.
- If a local work ID is known, read `.harness-delta/work/<work-id>/status.md`.
  Match the task and branch if several work items exist; do not guess.
- Reconcile notes with Git status, recent commits, code, and tests. A stale note
  is not evidence of completion. Preserve unrelated user changes.
- Missing local records are normal on a fresh clone. Reconstruct context from
  public requirements and the request; ask only for missing decisions.

## Working agreements

- Write repository artifacts, new local work records, commit messages, and PR text
  in English. Conversation may follow the user's language.
- Name work branches `<type>/<kebab-case-description>` using the
  [branch naming rules](CONTRIBUTING.md#branch-names). Use the work type rather than
  a tool name such as `codex/`; for example, `chore/project-setup`.
- Store personal plans, handoffs, and detailed reviews under `.harness-delta/`.
  Never force-add that directory or copy private records into public artifacts.
- Keep public requirements and verification instructions sufficient for contributors.
- Continue within the agreed batch. Confirm decisions that change requirements,
  collection scope, or public contracts before implementing them.
- Use camelCase in TypeScript and preserve snake_case at JSON/DB boundaries.
- Avoid dependencies on personal plugins, global settings, or machine-specific paths.
- Use this file as the shared entry point for Codex and Claude Code. Do not add a
  duplicate tool-specific instruction file.

## Product invariants

- Apply [the product requirements](docs/requirements.md), including their gates.
- Collect only for a registered project, active measurement task, and linked
  session. Determine permitted scope before reading session contents.
- Exclude prompt, response, source-code content, and secrets from measurement
  data, fixtures, exports, reports, and diagnostics. Use synthetic fixtures.
- Distinguish observed zero, missing, error, excluded, and unmeasurable values.
- Verify product-log formats and counter semantics; do not infer verified support.
  Follow the forward-version compatibility policy in R02 and
  [ADR 013](docs/decisions/013-forward-version-compatibility.md): inherited
  parsers produce labeled unverified estimates, with provenance and invalidation,
  until exact-version qualification. Runtime fallback uses finite source-specific windows and immutable provenance.
- Prevent double counting of replayed events, cached/reasoning tokens, and
  parent/child usage. Do not silently backfill unobserved intervals.
- Keep partial usage separate from complete totals and prevent deleted records
  from returning through imports or queued synchronization.
- Validate statistical methods before enabling inferential adoption decisions.

## Completion

- Map each acceptance criterion to evidence. General checks alone are insufficient.
- Run focused tests and `npm run check` for implementation changes. For documentation
  changes, check links, examples, and consistency; never invent test results.
- Obtain an independent agent review of requirements and the exact change scope.
  If unavailable, record `review-pending`; self-review is not independent review.
- Resolve material findings and verify fixes before marking a task complete.
- Update the local handoff with evidence, unresolved items, and the next action.
- Include sanitized acceptance, verification, and review results in the final report
  or PR. Distinguish local verification from remote CI execution.
