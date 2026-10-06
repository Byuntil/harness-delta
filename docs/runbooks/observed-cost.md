# Read an observed task cost estimate

[한국어](observed-cost.ko.md) · [Task procedure](workflow-quickstart.md)

This report prices **eligible stored observations** at an explicit reference rate.
It reads database events, not session files. It starts no product or model request.
`complete_amount` is always null. A partial estimate is not your bill, savings or an adoption result.
Linked root/child/rework events contribute only when their source and interval are eligible.
This report cannot qualify a source or prove that parent/child counters do not overlap.

## 1. Select the rate table

Use the same database as the measured task. Select the table explicitly.
For a pilot with an already registered `prices-1`, skip this registration example.

The checked-in [reference table](../../config/prices/openai-standard-short-2026-10-04.json) is a fixed OpenAI API Standard, short-context snapshot checked on **2026-10-04**.
Its unit is USD per 1,000,000 tokens. `as_of` is the verification date, not the effective-date claim.

| Exact model | Ordinary input | Cache read | Cache write | Output |
| --- | ---: | ---: | ---: | ---: |
| gpt-6-astra | 10 | 1 | 12.5 | 50 |
| gpt-6.1-sol | 2 | 0.1 | 2.5 | 10 |

The source is the [official API pricing table](https://developers.openai.com/api/docs/pricing), Flagship models / Standard / Short context.
The [Astra announcement](https://openai.com/index/gpt-6-astra/) confirms standard input/output rates.
The [Sol announcement](https://openai.com/index/introducing-gpt-6-1-sol/) also confirms its cached-input rate.
The pricing table supplies cache-write rates.
The [Astra model page](https://developers.openai.com/api/docs/models/gpt-6-astra) and [Sol model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol) distinguish long context above 272K input tokens.
This snapshot uses reference rates at or below that boundary.

**Rate notice:** Selecting this table does not prove a request used its service tier or context range.
Fast/Ultrafast, Batch/Flex, long-context and regional rates are not chosen automatically.
API estimates do not measure subscription billing or subscription allowance use.
No model aliases or rate substitutions apply.

1. If this table is the agreed reference, register it.

   ```sh
   node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table register \
     --config config/prices/openai-standard-short-2026-10-04.json
   ```

2. Read its registered contents.

   ```sh
   node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table show openai-standard-short-2026-10-04
   ```

Expected: immutable rates and the selected source/version.
Identical registration is idempotent. Changed content under one ID fails.
For different rates, select a new ID/version prospectively; a frozen protocol keeps its original table.

For another model, provide your explicitly chosen rates or omit the model.
Use the complete `prices.json` example with a new ID/version/source/date, one currency, `unit_tokens`, display policy and exact component rates.
Record the source URL, tier/context scope and verification date beside your local configuration.
A user reference rate is not an official vendor price.
A missing model remains unavailable; do not use another model's price.
The checked-in bounded table deliberately omits `gpt-6-sol` and other models.

## 2. Create the estimate

Prerequisite: authorized task observations already exist in this database.
Replace the task/table IDs if your pilot uses other identifiers.
Capture the UTC cutoff after the observations you intend to include:

```sh
reportCutoff=$(node -p 'new Date().toISOString()')
```

Estimate with the default legacy output-only basis:

```sh
node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table estimate-task task-1 \
  --price-table prices-1 --cutoff "$reportCutoff" --input-basis output-only-v1
```

If you selected the checked-in table instead, replace `prices-1` with `openai-standard-short-2026-10-04`.
This operation estimates existing data; it does not collect additional usage or inspect authentication.

Expected: `partial_amount`, null `complete_amount`, explicit reasons and observation-window evidence.
If the task was deleted, the estimate fails. Deletion does not restore earlier events.
The [workflow comparison report](workflow-quickstart.md#9-create-and-read-the-report) freezes its own assignment/follow-up window.
This task estimate uses task-start/active intervals and cutoff/finalization.
Do not assume the two reports include identical time windows.

## 3. Choose a legacy input basis only when intended

| Basis | Effect |
| --- | --- |
| `output-only-v1` | Price known legacy output; legacy input split stays unavailable |
| `cache-read-remainder-ordinary-v1` | Assume ordinary input is total input minus cached input; price cached input as cache read |

V1 events lack a verified disjoint ordinary/cache-write split.
The remainder basis assumes no separately billed cache writes in that remainder.
Unobserved cache writes have **not** been verified as zero.
Missing total/cache counters withhold the input estimate; cache above total input fails.
Reasoning output is already included in total output. Do not add it again.
V2 events retain their recorded disjoint billing components and attribution with either legacy basis.

If the assumption is agreed, request it explicitly:

```sh
node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table estimate-task task-1 \
  --price-table prices-1 --cutoff "$reportCutoff" --input-basis cache-read-remainder-ordinary-v1
```

Expected: the report names the basis and counts assumed input events.
Compare estimates only when rates, component coverage, input assumptions and windows are comparable.
An output-only estimate is not equivalent to an estimate with assumed input prices.

## 4. Read amount, missingness and coverage separately

| Field/state | Meaning |
| --- | --- |
| `partial_amount` | Sum of eligible priceable components; can contain an explicit input assumption |
| `partial_amount: "0"` | Eligible priced observations sum to zero |
| `partial_amount: null` | No eligible priced amount; not zero |
| `complete_amount: null` | Complete task cost is unavailable |
| `unpriced_events` | Recorded events have at least one component without a rate |
| `unavailable_events` | Events have no priceable partial amount |
| `excluded_event_count` | Stored candidates excluded by the observation-window policy |
| Missing / error / excluded / unmeasurable | Different reading states; none is observed zero |
| `observed_components_priced: true` | Eligible observed components are priceable; whole-task coverage is still unknown |

Read the reasons with the amounts. Empty or entirely unavailable observations have null partial cost.
Usage absence, unknown attribution/components and missing rates must remain visible.
Never add cached/reasoning subsets again or infer parent/child completeness from an aggregate.

The cutoff is exclusive. Events before task start and at/after finalization do not contribute.
Only recorded active intervals contribute. Paused and unobserved intervals are not backfilled.
Explicit loss/error/excluded intervals conservatively exclude events across the task.
Generic incomplete/unavailable coverage retains independently observed eligible events; it does not make them complete.
A candidate Claude out-of-window span can mark its listener window offline and exclude companion events conservatively.

The `coverage` object exposes guarded scope/identity facts, unknown facts and an ineligible decision.
A source-change failure retains an identity violation.
Journals ending after the cutoff cannot prove earlier coverage.
Empty windows have null coverage evidence and an ineligible decision.
Priceability does not establish request-universe completeness or terminal delivery.

## Provenance and verification reference

The JSON includes table contents/hash, deduplicated usage hash, formula `decimal160-disjoint-v1`, report version `observed-cost-v1` and input basis.
It also includes boundaries, event/session counts, assumed input counts and missing/unpriced reasons.
Amounts are decimal strings; rounding is for display.
Observation tables, gap reasons and the versioned window policy participate in the observation-window hash.
The coverage hash binds eligible events, journal metadata, rates and basis; it returns no source paths.

Developer arithmetic/reporting checks are listed in [CONTRIBUTING](../../CONTRIBUTING.md#observed-cost-verification).
They use synthetic fixtures and do not establish production completeness or real experiment effectiveness.
