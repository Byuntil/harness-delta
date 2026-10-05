# Observed task cost at fixed reference rates

This metadata-only report estimates recorded usage from every linked session of
one task, including parent, child and rework sessions. It reads stored events,
never session files. It does not establish complete topology, source support,
whole-task usage, savings or an adoption decision (R04/R05/R06). Parent/child
counter overlap must already have been excluded by the source; this report cannot
validate that from aggregate counters. Complete cost remains unavailable.

## Select an immutable table explicitly

The checked-in [reference table](../../config/prices/openai-standard-short-2026-10-04.json)
is an OpenAI API **Standard, short-context** pricing snapshot, checked on
**2026-10-04**. The unit is **USD per 1,000,000 tokens**. Its `as_of` is the
snapshot date, not a claim that prices first took effect at midnight that day.

| Exact model | Ordinary input | Cache read | Cache write | Output |
| --- | ---: | ---: | ---: | ---: |
| gpt-6-astra | 10 | 1 | 12.5 | 50 |
| gpt-6.1-sol | 2 | 0.1 | 2.5 | 10 |

Source ID `openai-api-pricing-2026-10-04` refers to the official
[API pricing table](https://developers.openai.com/api/docs/pricing), under
Flagship models, Standard, Short context. The
[Astra announcement](https://openai.com/index/gpt-6-astra/) independently confirms
standard input/output rates; the
[Sol announcement](https://openai.com/index/introducing-gpt-6-1-sol/) also confirms
its cached-input rate. The pricing table supplies cache-write rates for both.
The official [Astra model page](https://developers.openai.com/api/docs/models/gpt-6-astra)
and [Sol model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
define long-context pricing as requests with more than 272K input tokens; this
snapshot uses the reference rates for at most 272K input tokens per request.

This table is a **fixed comparison reference**: selecting it does not prove that
observed requests used that API service tier or context range. Long-context,
Fast/Ultrafast, Batch/Flex, regional processing and other pricing bases are not
selected automatically. API reference estimates are not subscription bills or
subscription usage allowances. No model aliases or substitutions are applied.

From the repository checkout, using the database that already contains your
registered task's authorized usage:

```sh
node dist/cli.js --db .harness-delta/local.sqlite price-table register \
  --config config/prices/openai-standard-short-2026-10-04.json
node dist/cli.js --db .harness-delta/local.sqlite price-table estimate-task task-1 \
  --price-table openai-standard-short-2026-10-04 \
  --cutoff 2026-10-05T00:00:00Z
```

Use your explicit database, task ID and cutoff. The examples do not launch a
product CLI, log in, read credentials or collect new data. The cutoff is exclusive;
events before the task start and at/after task finalization are excluded. Only
recorded active intervals contribute. Explicit collection-loss, error and excluded
intervals from both `observations` and `observation_gaps` are conservatively
excluded across the task. Generic `unmeasurable/incomplete` observations and
`incomplete`/`not_available` gaps describe unknown coverage and retain independently
observed eligible events; complete cost still remains null. Both metadata tables
and the versioned window policy participate in the observation hash, and gap
reasons remain visible. A Claude out-of-window span currently marks the entire
listener window offline, which can conservatively exclude valid companion usage.
Excluded event counts, window policy and the observation-window hash are reported.
Paused or unobserved intervals are not backfilled. Deleting a task makes subsequent
estimates fail rather than restoring prior data.

## Choose a legacy input basis

The default `output-only-v1` prices known legacy output only. V1 events do not
record a verified disjoint ordinary/cache-write input split, so their input cost
stays unavailable. To request a descriptive assumption explicitly:

```sh
node dist/cli.js --db .harness-delta/local.sqlite price-table estimate-task task-1 \
  --price-table openai-standard-short-2026-10-04 \
  --cutoff 2026-10-05T00:00:00Z \
  --input-basis cache-read-remainder-ordinary-v1
```

This basis prices `(total input - cached input)` as ordinary input and cached
input as cache read. It assumes the remainder contains no separately billed cache
writes; unobserved cache writes have **not** been verified as zero. It cannot be
used to certify complete cost. Missing total/cache counters withhold the input
estimate; cache exceeding total input fails. Reasoning output is already included
in output total and is never added again. V2 events retain their recorded disjoint
billing components and attribution regardless of the legacy basis selection.

The JSON report embeds immutable table contents and their SHA-256 hash, a hash of
the deduplicated usage snapshot, formula
version `decimal160-disjoint-v1`, report version `observed-cost-v1`, the chosen
input basis, observation boundaries, event/session counts, assumed input event
count and missing/unpriced reasons. Decimal amounts are exact strings; rounding
is for display only. `partial_amount` sums available components and may include
the explicitly selected assumption. `complete_amount` is always null. Empty or
entirely unavailable observations produce null partial cost; an observed zero
remains `"0"`. Output-only estimates and estimates with missing rates should not
be compared as if they price the same components. The existing task/comparison
reports and production completeness gates retain their current behavior.

## User-defined versioned rates and missing models

For a model without verified public prices, omit its entries so cost stays
unavailable, or supply your explicit reference rates through an ordinary
`price-table register --config` file. Use the reference table's existing strict
shape: a new `id`, `version`, `source_id`, `as_of`, one currency, `unit_tokens`,
rounding/display policy, and exact `(product, model, component)` decimal-string
rates. Record the source URL or user-selected basis, verification date, tier and
context scope beside the configuration; a user-defined rate is not an official
vendor price. Never substitute another model's rate. `gpt-6-sol` and other models
are deliberately absent from this bounded snapshot.

Registration of identical content is idempotent. Changed contents under the same
ID fail; choose a new ID/version and select it explicitly for a new comparison.
Changing a reference table never changes stored usage or a protocol's immutable
price-table binding. No operational prices or missing settings are generated by
default.

Offline checks:

```sh
npm test -- tests/observed-cost.test.ts tests/observed-cost-cli.test.ts tests/pricing.test.ts tests/task-cost.test.ts
npm run check
```

Public fixtures are synthetic. These tests establish arithmetic and reporting
behavior, not production source completeness or real experiment readiness.

The report's `coverage` object is produced from the same task window and recorded
workflow journals. It exposes verified guarded source scope/identity, unknown
facts and an ineligible decision; a source-change failure retains an identity
violation. Journals finishing after the cutoff cannot justify earlier coverage.
`observed_components_priced` describes only eligible recorded usage under the
explicit selected table. Even `true` does not establish whole-task price coverage,
request-universe completeness or terminal delivery. Empty windows have null
evidence and an ineligible decision. The coverage snapshot hash binds the journal
metadata, eligible events, rates and input basis; no source paths are returned.
