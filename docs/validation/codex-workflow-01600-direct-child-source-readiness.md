# Codex 0.160.0 single direct-child workflow source admission

The code-owned registry admits `codex / 0.160.0 /
codex-workflow-direct-child-v1`, evidence ID
`codex-workflow-01600-direct-child-native-v1`, `validation_kind: real_operations`
and `complete_cost: false`. This separate profile supports a fresh native root
with exactly one fresh, fork-free direct child and partial own-response collection.
The existing root-only profile and its restrictions remain separate.

## Actual shared-engine evidence

One separately approved native launch completed on macOS arm64 with Node 24 and
the pinned Codex 0.160.0 binary. It used an existing authenticated home, managed
restricted read-only permissions, `on-request` / `auto_review`, transient selected
instructions and SessionStart/SubagentStart metadata hooks. No authentication or
permanent settings changed. The direct child was fresh, with no forked context.

| Boundary | Observed result |
| --- | --- |
| Root and direct child | `gpt-6-astra/high` root; one `gpt-6.1-sol/high` child |
| Same logical task | Two linked sessions, parent3 and child1 own-response records |
| Per-request runtime | Four runtime records matching the two requested runtimes |
| Selected marker behavior | Marker verified; native launch phase completed |
| Database reopen/shared-engine collection | Zero additional usage records |
| Fresh Node process accounting replay | Original live ledger retained four usage and four runtime records; zero inserts |
| Verified source boundary | Exact linked sources, runtime/permissions and durable prefix checks |
| Native deadline | 16,867 ms elapsed under a shared 180,000 ms deadline |

The immutable successful execution evidence has SHA-256
`f60bfac70ddc3c4054d0f104386a07d438dab5d2bc4a1ebbfb297a9fbc6a839b`,
used as the registry's `semantics_digest`. Its consumed intent SHA-256 is
`681f6d04aa40144843fc5e353aa9655fca2d6da82fb2eed09de510d819480dea`;
the actual execution implementation digest is
`d99528941682e56959797a8eeabb8f5ac421ee118e8a9081428cf21af980ae7a`.
The pinned binary SHA-256 is
`112fae7a5a1223e673c8a1791d32338f37df8b527ff1159bb8adac6c4dbf1b4b`.
These digests identify the historical successful engine, not the later CLI
integration build. Earlier failed attempts remain preserved. Private paths, task,
session and request IDs, marker contents, instructions and credentials are omitted.

The preceding diagnostic run confirmed that a completed native V2 wait can have
an empty receiver array. Qualification accepts this only with an already verified
child hook/source binding and still requires matching source activity and child
own usage. Stdout cannot authorize a source, discover a child or establish usage.

## Production connection and supported boundary

The [assigned workflow CLI](../runbooks/task-native-workflow.md) reuses this engine
and the durable task/harness coordinator. The native child launch is limited to
macOS arm64/Node24 and the exact pinned binary, read-only sandbox and one direct
child with an explicitly selected model/effort. Runtime values are user choices;
the fixed actual pair above is qualification evidence, not product policy or proof
that every provider model/effort combination is available.

`launch` binds the fresh root before reading it and the fresh child through the
authenticated metadata callback before reading its source. It requires the root
spawn activity to corroborate that one child and verifies the child own-response
record. Second/deeper children, inherited/forked/compacted histories, unsupported
source origins and identity/runtime/permission mismatches fail closed.

`collect` resolves only the source-verified child journal of a completed development
launch for the specified root, same task/project and task generation. A supplied
child mapping must match that stored binding; it cannot link a new or external
child. Recorded turn/runtime identities and managed permissions are rechecked on
both sources. Collection baselines existing history, accepts future own records in
those bound turns, and excludes records from earlier unobserved intervals even if
they arrive later. Reopen/replay checks durable inode/size/prefix and globally scoped
request IDs. Dropping or substituting a stored child cannot select the root-only
profile; the coordinator rechecks the selected profile at every active boundary.

Family `resume`, external `link`, arbitrary child discovery, child reuse and new
family turns are unsupported. Continuing a logical task may launch another fresh
root/child pair with the same immutable task metadata and original sticky harness
assignment. A paused task's new generation needs a fresh launch, not child reuse.
Durable stop controls collection/process termination and never finalizes the human
task or imposes a provider request/token/cost cap.

The ordinary public CLI/coordinator connection is verified offline with synthetic
files and isolated SQLite worker processes. Checks cover the actual CLI schema,
sticky assignment, selected instructions, flexible runtimes, known child collection,
durable stop, fresh-process replay, partial estimates and rejected unsafe inputs.
Production launch reaches the pinned-binary check without spawning a product in
offline tests. This is not a live user A/B experiment. The qualification used its
existing isolated internal lease, JSON marker validation and Git-check handling.

An offline regression additionally verifies that observation time is sampled after
both bounded source reads: a child record created between those reads must not fail
solely because the earlier root read supplied the recording timestamp. No further
native run was performed for this integration correction.

## Independent gates and user inputs

Usage remains an observed subset. Marker behavior is not native resolved-harness
attestation; a subprocess count is not an independently verified backend request
count. Full request universe, terminal/flush coverage, observation continuity and
complete price coverage remain unknown. Cache components and reasoning tokens keep
their verified semantics; missing components are not converted to observed zero.
Partial standardized estimates include only committed priced observations.

`complete_cost: false` cannot be overridden with user/imported coverage flags or
synthetic complete facts. Complete cost, Claude admission, app/IDE/MCP support,
arbitrary descendants, fork/compaction and inferential adoption remain unavailable.

The user must still supply the registered real project, immutable A/B artifacts and
manifest identities, frozen price table and complete v2 protocol, logical task and
criteria, runtime choices and native execution inputs. Source admission does not
create these inputs or authorize a new model call. No actual workflow or experiment
is silently initiated by registering this profile.
