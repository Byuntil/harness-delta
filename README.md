# Harness Delta

Local metadata measurement and harness comparison for real development tasks.

**Status: development scaffold.** The measurement CLI, product adapters, domain
store, and reports are not implemented yet. Current tests validate development
dependencies and harness checks, not measurement capability.

## Development

Use Node.js 24 and npm:

```sh
nvm install
nvm use
npm ci
npm run check
```

Use your preferred version manager if you do not use nvm. Select Node 24 before
installation; the project enforces the Node major version and pins dependencies.
Local validation has covered macOS arm64. Other platforms remain unverified.

Dependency installation also installs Husky. Each commit runs `npm run check`;
the commit-msg hook validates Conventional Commit formatting. Select Node 24 in
your terminal or Git client before committing. See the
[Git hook instructions](CONTRIBUTING.md#git-hooks).

| Command | Purpose |
| --- | --- |
| `npm test` | Run all tests |
| `npm test -- tests/runtime.test.ts` | Check SQLite and decimal dependencies |
| `npm run test:watch` | Watch tests |
| `npm run lint` | Run ESLint with type-aware TypeScript rules |
| `npm run lint:fix` | Apply supported lint fixes |
| `npm run typecheck` | Check source and test types |
| `npm run build` | Build ESM output and copy SQL assets to dist |
| `npm run check:privacy` | Reject local records in the Git index |
| `npm run check` | Run privacy guard, lint, type checking, tests, and build |
| `npm pack --dry-run` | Inspect the package contents |

SQL migrations will live under `src/migrations` and be copied to `dist/migrations`.
`src/index.ts` is currently an empty entry point; there is no `hm` executable yet.

## Requirements and contribution

- [Product requirements and acceptance gates](docs/requirements.md)
- [Contribution guide](CONTRIBUTING.md)
- [Shared agent instructions](AGENTS.md)
- [Development and handoff workflow](docs/development/workflow.md)

The project is designed to collect metadata only for registered projects, active
measurement tasks, and linked sessions. Prompt/response content, source-code
contents, and secrets are excluded. Installation does not start collection.

Public documentation is in English. Personal plans, progress, and review records
stay under the Git-ignored `.harness-delta/` directory; a fresh clone does not need
them to build or contribute. Codex and Claude Code share a single `AGENTS.md`.

The package remains `private: true` while under development. Publication name and
channel are separate decisions. See the [MIT license](LICENSE).
