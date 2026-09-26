# Runtime and storage baseline

The implementation uses TypeScript strict, Node.js 24, ESM, npm, and SQLite through
better-sqlite3. Exact dependencies and transitive resolution are recorded in
package.json and package-lock.json. Statistical packages remain undecided.

Fresh local validation on 2026-09-26 used macOS arm64 and Node.js 24.21.0:
`npm ci` completed and `npm test` passed the existing three scaffold tests.
These cover native SQLite transaction/rollback, decimal arithmetic, and the
private-record index guard. They are not product-store acceptance evidence.
Other operating systems and remote CI are unverified for this change.

Migrations belong in src/migrations and are copied into dist/migrations by the
existing build. Product migrations must be numbered and version-checked. The hm
binary will be registered only when a CLI entry point exists. The existing MIT
license and private package flag remain in effect; no publication is authorized.

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for reproducible setup and checks.
