# Tool supplied reference prices

The tool supplies a reviewed, versioned catalog instead of requiring routine user
price-table registration. This decision applies to standardized estimated token
cost under R02/R04/R05/R06/R07/R09/R10. It does not admit a collection source,
complete-cost profile, real experiment or inference method.

## Source and reference policy

The bundled [catalog](../../config/prices/catalogs/reference-catalog-2026-10-06.json)
contains seven exact model identifiers and one explicitly verified Haiku alias.
Rates were checked on **2026-10-06 UTC** against
[OpenAI pricing](https://developers.openai.com/api/docs/pricing) and
[Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing).
The midnight verification/publication timestamp represents the day snapshot; it
is neither an exact checking minute nor a vendor effective-date claim.
Unknown effective dates remain null. Anthropic identifiers/alias were checked in
the [model overview](https://platform.claude.com/docs/en/models/overview).

`reference-standard-v1` is USD per 1,000,000 tokens: OpenAI Standard short context
and Anthropic first-party global Standard with a 5-minute cache-write reference.
Applying this policy binds Codex to OpenAI and Claude Code to Anthropic for the
reference estimate. Output says `provider_basis: reference_policy`; the product
name alone does not establish the actual provider, billing tier, context length
or cache TTL. Callers with separate verified provider evidence can pass it to
the matcher; a reseller identity does not match first-party prices.
Fast/Flex/Batch, region, personal discounts, subscription allowances, tool charges,
image/audio units and actual billing reconciliation are outside this policy.

The [OpenAI Models API](https://developers.openai.com/api/reference/resources/models/methods/list)
and [Anthropic Models API](https://platform.claude.com/docs/en/api/models/list)
do not document reference price fields. Official pricing pages are available, but
this investigation did not confirm a documented, stable official catalog API.
The app catalog is tool-maintained and source-checked, not an official vendor API.
No third-party catalog is used. A future public catalog must identify its author,
license, upstream verification and pinned version/hash before adoption.

Effort is not a rate dimension. It can change observed usage. Cache reads/writes
are separate disjoint components; writes replace ordinary input for those tokens.
Reasoning tokens are included in output, never charged twice. See
[OpenAI caching](https://developers.openai.com/api/docs/guides/prompt-caching),
[OpenAI reasoning](https://developers.openai.com/api/docs/guides/reasoning) and
[Anthropic thinking cost](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost).
Unsupported modifiers or unknown token readings cannot be inferred from the catalog.

## Distribution, update and pin

The bootstrap ships in `dist/catalogs`; a local database retains the last accepted
catalog. `catalog-status` exposes verification/version, last check/success, failure
and the update channel. `refresh-catalog` reloads the bundle or accepts an explicit
trusted publisher artifact with SHA-256. A hash proves the supplied bytes, not the
publisher's authority or the rates' truth: operators must obtain it from a trusted
release channel. The approved first release is
[reference-prices-2026-10-06-v1](https://github.com/Byuntil/harness-delta/releases/tag/reference-prices-2026-10-06-v1).
Its two assets passed a real bounded HTTPS download/refresh check on 2026-10-06.
`defaultPriceCatalogSource` uses this publisher's `releases/latest/download/manifest.json`.
Online refresh is on demand; no automatic network refresh or scraper is enabled.
An explicitly unconfigured server source still returns `catalog_source_not_configured`.
The server owner supplies fixed source configuration, never browser request URLs.

`readOnlinePriceCatalogStatus` exposes `online_source`, `can_attempt_online_refresh`
and `verification_age_days` in addition to the existing status. Configuration means
an attempt is permitted; it does not prove availability or that prices were checked
today. `publisher_id` is a declared issuer bound to the configured ID; publisher
trust comes from the fixed approved HTTPS source, not that string or the content hash.
The release manifest binds policy, catalog ID/version, verification/publication dates,
exact artifact length and SHA-256. The artifact retains its original reviewed bytes.
No signatures, model calls, credentials, tasks or measurement data are required.

The transport reads at most 16 KiB of manifest and 1 MiB of catalog within the existing
5-second refresh deadline. Only a digest-named JSON artifact beside the manifest is
accepted. HTTPS requests send no cookies/local metadata and do not use authentication.
Redirects are denied for generic sources. A separately approved fixed
`Byuntil/harness-delta` GitHub source may follow at most two hops: the same publisher
tag/asset and configured `release-assets.githubusercontent.com` or
`objects.githubusercontent.com`. Each target is validated before request; signed CDN
queries are transient. Resolving `latest` captures its tag before fetching the artifact,
so a concurrent latest-release change cannot mix manifest/artifact versions.
[GitHub's release-asset API](https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28)
documents both 200 and 302 downloads. The first release passed this redirect path.

Maintainers can prepare the two public files locally after a build:

```sh
node scripts/prepare-price-catalog-release.mjs config/prices/catalogs/reference-catalog-2026-10-06.json .harness-delta/catalog-release-v1
```

The output is only `manifest.json` and `catalog-<sha256>.json`: normalized numeric
rates, source links, model/provider aliases, policy, version and dates. Existing
different files are not overwritten. The script publishes nothing. Publication requires
explicit approval of the repository, tag, commit and exact public files. Future GitHub latest releases
must carry both catalog files, or clients retain cached rates on a failed refresh.

The validator accepts only the bounded known schema/policy/currency/unit, exact
official source URLs, unique literal mappings and decimal rates. Loading is limited
to 1 MiB and 5 seconds. Future publication dates, downgrade, changed payload/bytes
under one catalog ID, failed loads and bad hashes fail closed. Racing updates cannot
replace a newer version with an older one. Failure retains cached prices and exposes
a sanitized reason; cached verification may be stale. First initialization remains
offline. A new shipped bundle updates an existing database only through refresh.

For a V2 protocol with no price-table ID, CLI registration prepares an immutable
PriceTable plus catalog/policy/matching sidecar once. Repeated registration retains
the first pin. Explicit user tables retain their old API/CLI behavior. Task estimates
without a table use their frozen V2 comparison pin or the current catalog for a
standalone task. Refresh never rewrites a protocol or existing price table/report.
No default comparison configuration, enrollment window or deadline is changed.
`readReferenceTaskCostReport` shares that selection/capture/projection path with
descriptive task facades and the default CLI. Its exported `ReferenceTaskCostReport`
retains catalog matches when available, legacy fallback, coverage and partial reasons.
It admits the existing task start/active/loss window; an external clock owner must
ensure or separately restrict its own window start. No new clock is inferred here.

## Minimal contracts and revaluation

Catalog identity/version and canonical hash bind each compiled basis; its content
ID also binds policy, `exact-catalog-v1` and exact compiled rate entries. Aliases
are explicit catalog literals, scoped by product/provider. No family prefix,
effort suffix removal or fuzzy fallback is permitted. Raw model evidence remains
unchanged. Unknown provider/model/attribution/condition/rate stays unavailable.
An explicit zero rate differs from a missing rate. Missing/error/excluded usage
does not become zero even when its model/rate is known.

Retained cost inputs contain only validated eligible usage metadata, the original
cutoff/window/coverage hashes, table identity and original arm IDs. Task capture
reuses the existing active/loss interval selection. Comparison capture reads the
original frozen report input, preserving assignment, follow-up and receipt
eligibility. It does not reread live session files or include newly observed usage.
An input ID cannot silently recapture a different snapshot.

Repricing creates a separately identified immutable descriptive result. All retained
tasks/arms use one target basis and the original formula/window. Original report
bytes and results remain unchanged, including originally unknown costs. A newly
listed model can later yield a partial estimate; usage completeness does not improve.
`complete_amount` stays null. No adoption, primary mean or relative-change result
is generated. Deleting a dependent task/project or invalidating the base comparison
purges the retained input and its revaluations; opaque tombstones prevent ID revival.
This batch adds no cost snapshot export/import or sync format.

User procedure: [English](../runbooks/reference-price-catalog.md)
([한국어](../runbooks/reference-price-catalog.ko.md)). Synthetic verification:

```sh
npm test -- tests/price-catalog.test.ts tests/price-catalog-store.test.ts tests/price-catalog-selection.test.ts tests/price-catalog-cli.test.ts tests/price-catalog-online.test.ts tests/catalog-cost-report.test.ts tests/price-revaluation.test.ts
```

These checks cover catalog identity, cache retention, exact matching, frozen pins,
missing/zero values, immutable repricing and deletion. They do not prove deployed
distribution, official price timeliness, production source completeness or spending.
