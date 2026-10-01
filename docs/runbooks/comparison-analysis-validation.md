# Offline comparison analysis validation

Select Node.js 24, then run from a Git checkout:

```sh
npm ci
npm test -- tests/comparison-analysis-design.test.ts tests/comparison-analysis-statistics.test.ts tests/comparison-analysis-evidence.test.ts
npm run analysis:validate
npm run check
```

The command compiles its dedicated study and independent oracle using the locked
local TypeScript dependency. Generated files stay under ignored
`.harness-delta/analysis-validation-build/`. It never runs product CLIs, live
conformance, session readers, or collection. No external case, DB, session or
input path argument is supported; unknown arguments fail before compilation.
The production build and exports do not include this study.

To save pure JSON without npm's command banner:

```sh
mkdir -p .harness-delta/analysis-validation-results
npm run --silent analysis:validate > .harness-delta/analysis-validation-results/evidence.json
```

Exit 0 means all versioned bounded checks passed; failure exits nonzero. Preserve
failed evidence. Do not delete failing cases or tune thresholds after results.
A material method change requires a new version and independent review. A
compile/setup failure emits a fixed sanitized failure code; run `npm run typecheck`
locally for compiler diagnostics.

Evidence contains expected/executed counts, each case's exact target and
expectation, sharp-null rejection probabilities, explicit rejected domains,
runtime versions and source/settings/design/case hashes. Case classifications and
required check identities are independently pinned, not inferred only from total counts. Fractions are reduced decimal-string
pairs; comparison is exact. Repeated runs with identical source and runtime are
deterministic. The manifest includes candidate, oracle, acceptance tests, wrapper,
compiler settings, package/lock and ADR. Source hashes bind relative filenames and
contents; their ordered list has an aggregate hash. Generated output is excluded.
These hashes describe provenance, not a trusted admission credential.

Read [ADR 009](../decisions/009-comparison-analysis-validation.md) for assumptions
and [the version 1 dossier](../validation/comparison-analysis-validation-v1.md) for
actual results. `status: pass` applies only to these fixtures. `r10_status` remains
`unvalidated`, adoption remains `inconclusive`, and real assignment still rejects
with `real_experiment_disabled`. Partial report usage remains partial.
