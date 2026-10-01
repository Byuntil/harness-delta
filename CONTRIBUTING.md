# Contributing

Harness Delta has metadata contracts and a local storage foundation. Read the
[product requirements](docs/requirements.md) before proposing or implementing behavior.
The repository provides a local measurement CLI and partial sequential adapters for
Codex CLI 0.156.1 and Claude Code 2.1.283. These observations are incomplete and do
not establish full task usage, app support, or descendant aggregation. See the
[capability evidence and limits](docs/decisions/001-adapter-capabilities.md) and
[local measurement runbook](docs/runbooks/local-measurement.md).

## Development environment

Use Node.js 24 and npm. With nvm:

```sh
nvm install
nvm use
npm ci
npm run check
```

Other version managers are welcome; select Node 24 before installing. The lockfile
pins dependencies. SQLite may require native build tools if no matching binary is
available. Local validation has covered macOS arm64; other platforms are unverified.

`npm run check` checks the Git index for local records, runs ESLint and TypeScript
checking, executes tests, and builds the package. Run it from a Git checkout.
Use `npm test -- tests/runtime.test.ts` for focused tests.

## Linting

Run `npm run lint` to check TypeScript source, tests, and configuration, plus
JavaScript configuration and scripts. `eslint.config.js` uses the recommended
ESLint rules and type-aware typescript-eslint rules for TypeScript, including
unhandled promises and unsafe type usage. Type-aware linting uses `tsconfig.json`;
include new TypeScript directories there when adding them.

Run `npm run lint:fix` to apply supported automatic fixes, then inspect the diff.
Normal checks never apply fixes. Warnings fail the lint command. Generated output,
dependencies, private `.harness-delta/` records, and locally installed
`.agents/skills/` packages are excluded. Skill packages are not part of the project
TypeScript program; validate them with their own tooling. Linting is not a
formatter; no additional formatting conventions or lint-staged dependency are added.

TypeScript is pinned to a 6.0 release compatible with the installed typescript-eslint
peer range. Upgrade both together when newer compiler support is available; do not
bypass incompatible peer dependencies with force-install flags.

## Git hooks

`npm ci` or `npm install` runs `prepare` to install Husky for this checkout.
The pre-commit hook runs `npm run check`: it rejects indexed local records, runs
lint and type checks, executes tests, and builds. A failed command stops the commit. Generated Husky
files under `.husky/_/` are ignored; `.husky/pre-commit` and `.husky/commit-msg`
are shared in Git. The commit-msg hook validates the proposed message with commitlint.

Select Node 24 before committing. GUI Git clients must also have Node 24 and npm
on their PATH; see [Husky's version-manager guidance](https://typicode.github.io/husky/how-to.html#node-version-managers-and-guis).
Run `npm run prepare` to reinstall hooks if needed. No global configuration is changed.

Checks run against the working tree; the privacy guard checks the Git index.
With partially staged changes, also inspect the staged diff because the tested
working tree can differ from the commit. Hooks do not stage or modify source files.
They do not enforce commit-message language or replace independent review.
CI disables hook installation with `HUSKY=0` and runs checks explicitly. Hooks can
be bypassed locally, so CI and review remain required verification layers.

## Changes and review

- State the problem, intended behavior, scope, and acceptance criteria first.
- Link public requirement IDs, issues, or public design decisions. A personal plan
  must not be the only explanation for shipped behavior.
- Add meaningful tests for behavior changes, including failure and boundary cases.
  For bug fixes, demonstrate the failure before applying the fix.
- Keep fixtures synthetic. Do not attach real session logs or personal paths.
- Run relevant checks, then report actual results and unverified behavior.
- Use the [agent workflow](docs/development/workflow.md) when working with an agent.
  Agent-assisted tasks require independent agent review. Manual contributions can
  use normal maintainer review without an AI account, plugin, or subscription.

## Task comparison workflow

The [task comparison runbook](docs/runbooks/task-comparison.md) describes the
synthetic-only workflow and assignment reports. Configuration registration, durable assignment and
manual application evidence do not enable real experiments or inference.
Explicit synthetic [file exchange and frozen team reports](docs/runbooks/team-file-exchange.md)
use a separate strict sharing boundary with static writer mappings and conservative
deletion. They do not enable live experiments or prove team completeness.
See [ADR 008](docs/decisions/008-task-comparison-workflow.md) for contracts and limits.

## File adapter profiles

Registered file adapters live in `src/adapter-profiles.ts`. Registration is an exact `(product, version)` allowlist. A new version whose semantics are unchanged is data, fixtures, and evidence. A semantic change is a named code variant plus tests; the old variant is not edited to fit the new version. Codex 0.158.0 lives under `scripts/conformance/` and is not registered. The conformance runner is manual. `npm test` runs offline synthetic unit tests of the report projector, the candidate parser, and the confirmation helpers. It does not run the conformance runner, spawn product CLIs, or open real sessions. See [ADR 007](docs/decisions/007-adapter-version-profiles.md).

## Branch names

Name work branches `<type>/<kebab-case-description>`. Choose a type that describes
the work: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`,
`style`, or `test`. Use a concise English description made of lowercase letters
and digits, with single hyphens between words. Use exactly one slash; do not use
spaces, underscores, uppercase letters, or tool-specific prefixes such as `codex/`.

```text
feat/session-tracking
fix/duplicate-events
chore/project-setup
docs/contribution-guide
```

The default branch `main` is exempt. Apply this convention when creating or
explicitly renaming a work branch. Do not automatically rename existing branches
or recreate branches for detached checkouts. If a requested name already exists,
do not overwrite it; resolve the name with the user.

This is a contributor and agent instruction, not a Husky or CI validation rule.
Commit-message validation remains separate.

## Language and commits

Write documentation, code comments, new local records, commit messages, and PR text
in English. Use `<type>: <imperative summary>` with an optional scope, for example:

```text
chore: add the development harness
fix(store): reject conflicting events
docs: clarify collection boundaries
```

The commit-msg hook uses `@commitlint/config-conventional` from
`commitlint.config.js`. Allowed types are `build`, `chore`, `ci`, `docs`, `feat`,
`fix`, `perf`, `refactor`, `revert`, `style`, and `test`. Use a lowercase type,
an optional `(scope)`, a colon followed by a space, and a nonempty summary.
Keep the header at most 100 characters and omit its trailing period. The preset
also checks subject case and conventional body/footer formatting. Breaking changes
may use `!`, for example `feat(api)!: change the response format`.

Messages such as `update stuff`, `foo: add a feature`, and `fix:` are rejected.
Commitlint's standard ignores remain enabled for generated merge/revert, version,
and autosquash messages. English wording and imperative grammar remain review rules;
the hook checks structure, not natural-language correctness.

To validate a message file manually:

```sh
npm run commitlint -- --edit path/to/message.txt
```

This is local message validation; the current CI checks code but does not lint
commit history. Local hooks can be bypassed.

Describe the change without private task IDs, user paths, or session history.
Do not include unrelated working-tree changes in your commit.

## Public and local information

Public source, requirements, durable architecture decisions, tests, contributor
guidance, and CI belong in Git. Personal plans, work status, detailed reviews,
temporary evidence, and original private design material belong under
`.harness-delta/`, which is ignored. Never force-add it.

Before submitting, run `npm run check:privacy` after staging to check the actual
index, and inspect `git diff --cached`. This guard only detects the local directory
in the index; review other files for accidentally copied private content as well.
Ignored records are not backed up, encrypted, or synchronized by Git. A new clone
or worktree must reconstruct context or receive an explicitly selected handoff.

## CI

Pull requests and pushes to `main` run Node 24 checks on macOS. The workflow needs
no private plans, session data, or agent credentials. It does not perform agent
review or prove requirement completeness. Adding the workflow does not configure
branch protection or mean a remote run has passed.

## Offline comparison method study

The [comparison analysis validation runbook](docs/runbooks/comparison-analysis-validation.md)
reproduces the bounded synthetic study with `npm run analysis:validate`. Its exact
oracle checks are separate from full R10 validation and real experiment readiness.

## Offline statistical validation

Use the [analysis validation runbook](docs/runbooks/comparison-analysis-validation.md)
for the separate `npm run analysis:validate` sharp-null arithmetic study and
`npm run analysis:validate:confidence` bounded mean-effect/deadline-quality study.
Both are synthetic development commands under Node 24. Full confidence calibration
is opt-in, outside normal unit tests. Neither enables production inference or real
experiments; preserve the fixed registries, failures and historical evidence.
