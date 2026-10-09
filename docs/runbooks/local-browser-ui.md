# Local browser workflow

[한국어](local-browser-ui.ko.md)

Use the private `hm` checkout with Node.js 24. This UI shares the CLI's Store and
external-task coordinator. It does not launch an agent, change authentication,
create commits, or publish a service.

## Start the local service

From the checkout:

```sh
npm ci
npm run build
node dist/local-web-main.js --db local.sqlite --setup reviewed-ui-setup.json
```

After main CLI registration, the equivalent command is:

```sh
hm --db local.sqlite ui --setup reviewed-ui-setup.json
```

Open the printed `http://127.0.0.1:4318` address. `--port` changes only the local
port; no host option exists. Stop the local service with Ctrl+C. Its collectors
settle and active measurement pauses; the external AI remains under your control.

## Measurement criteria for tasks

In **Setup**, select a project directory. Registration reads Git HEAD and does not
create a repository or commit. The code baseline is read again when preparing a
new task. Uncommitted edits are preserved; HEAD identifies the committed baseline,
not a snapshot of uncommitted files.

Select **Import settings file**, or pass the reviewed file through `--setup`. The
private manifest has `schema_version: 1` and `profiles`, each with `id`, `name`,
`setup`, and `execution`. `setup` uses the shared `ExternalTaskSetupSchema`;
`execution` contains the reviewed binary, Codex home, recorder, sandbox, timeout,
and poll interval. Session identity and source paths are chosen later, not preset.
See the [external workflow](external-session-workflow.md) for its source contract.

Templates must already refer to a registered project, frozen schema-2 protocol,
reviewed harness pair and fixed completion criteria. The shared selection builder
checks those references. The UI does not invent comparison rules, pricing,
completion criteria, or source admission. Unsupported type/size choices stay
disabled. The form offers feature/fix/infra/chore/docs/ci and small/medium/large.
Model and effort remain flexible choices in your native agent.

The **Measurement criteria for tasks** section groups those inputs for reuse in
new tasks. Cards show the project, harness A/B and allowed task types and sizes.
Choose matching criteria in **New task**; the file does not grant collection access.
A new or mixed import shows **Reviewed setup connected.** An identical repeat
shows **This setup is already connected.** It creates no duplicate settings or
tasks. A same-ID content conflict rejects the whole file and preserves existing
settings. Cancelling the picker leaves settings unchanged.

### Prepare a settings file

The UI imports existing files; it has no file creation or editing form.

1. Follow steps 3–4 of the [workflow quickstart](workflow-quickstart.md) to
   register the reviewed project, price table, A/B variants and schema-2 protocol,
   then freeze the protocol in the same measurement database. Replace synthetic
   example choices before registration. Writing a settings file does not create
   those registrations.
2. In a text editor, create a private JSON manifest with `schema_version: 1` and
   `profiles`. Give each profile a unique `id` and recognizable `name`. Put the
   reviewed workflow input in `setup.workflow`, runtime input in `setup.runtime`,
   and preparation spec in `setup.preparation`. For the manual CLI handoff,
   include the reviewed `setup.native_binary` described in the
   [external workflow](external-session-workflow.md). Use your accepted inputs;
   do not infer criteria, protocol or price defaults.
3. Put only `binary`, `codex_home`, `hook_recorder`, `sandbox`, `timeout_ms`
   and `poll_ms` from the reviewed execution input in `execution`. Do not copy
   an entire launch/session input. Optional session binding must match the
   [UI manifest schema](../../src/local-web-domain.ts). Keep the file private.
4. After building, check its structure with the loader below, then select
   **Import settings file**. This check reads the selected file only; it does not
   register dependencies, launch an agent or qualify collection support.

```sh
node --input-type=module <<'JS'
import { readLocalWebManifest } from './dist/local-web-domain.js';
readLocalWebManifest('reviewed-ui-setup.json');
console.log('Setup file structure is valid.');
JS
```

Expected: **Setup file structure is valid.** Registration references and source
gates remain separate checks when choosing and preparing a task.

## Choose a connection path

The steps below describe the exact Codex 0.160.0 ticket path. For ordinary
terminal sessions and family collection, use [Harness Connect](harness-connect.md).
That path has separate candidate qualification and local pilot authority, including
Claude 2.1.291/2.1.293/2.1.294; installing a skill alone does not enable collection.
File or launch-workflow compatibility windows do not widen either UI source gate.

## Prepare, connect and observe

1. In **Tasks**, select **New task**. Enter a recognizable name and project, then
   select **Measurement criteria for tasks**.
   Optional settings contain type, size and the automatically read baseline.
2. Select **Prepare measurement**. The task is registered and automatically
   assigned to A/B. Internal IDs are generated; no observation interval starts.
3. Apply the prepared configuration. Only the reviewed managed instruction file
   can change; unapproved existing contents and common-file drift block writes.
4. Get new-session instructions. Copy them to your usual terminal and open a
   fresh session yourself. Production handoff requires the reviewed canonical
   Codex 0.160.0 binary hash; it never falls back to an older PATH binary.
5. Select the exact session file and connect it. A one-use ticket binds the fresh
   root and native developer fragment to this preparation. Prior usage is excluded.
6. Start observation and wait for the in-progress state before doing the work.
   Pause stops observation and active time, not the external AI. Resume establishes
   another future-only baseline; usage during pauses is not backfilled.

The operative deadline starts at the first verified connection and survives
reconnection and rework. Active measurement time is not human labor time.
File preparation, native input evidence and actual tool use are separate facts.
The actual native startup order before work remains unverified. This ticket path does not support external Claude
or IDE collection; the admitted tool-launched Claude parent
workflow is a separate path.

## Agent names in the session family

For linked families, the agent column shows verified Codex nicknames with roles,
or Claude agent types and configured names. Models from eligible observed usage
appear in a separate column; no observed model displays **Unknown**. A model
change can show several models for the same session.

Missing names display **Child N** (or **Parent** for roots). Child numbering
counts children only. Duplicate names receive a short identifier derived from the
full session identity. UUID/member identifiers still control relations and usage
aggregation. Labels never merge sessions.

Names are saved when the member is linked and survive restart. Existing records
without names remain usable and retain their fallback labels. No conversation,
response, file content, title or historical name search supplies a label. These
local binding fields are outside measurement exchange. Existing source admission,
partial-cost and collection-scope limits still apply. See the
[metadata source evidence](../validation/agent-display-metadata.md).

## Decide the result

After observation settles, decide success, same-request rework, failure or
abandonment in the detail view. Successful confirmation records the reviewed
criteria as fulfilled; optional details expose per-criterion assessment. Success
is final for this task. Rework before finalization keeps the assignment, window,
previous usage and attempt history. Added requirements belong in a new task.
Leaving the page keeps the result undecided. Agent exit never records success.

Before preparing another task in the same project, stop the external AI yourself
and confirm it stopped. This releases preparation ownership; the UI does not kill
that process or silently replace its harness. Existing preimage checks still apply.

## Prices, recovery and local boundaries

Reference prices use the tool-owned approved update source. Configured does not
mean reachable or latest; refresh failure retains cached prices and pinned task
bases. Cost is only the partial estimate for observed, matched usage. Unknown
prices retain usage observations. Complete cost and inferential adoption remain
unavailable. See [reference prices](reference-price-catalog.md).

Reload restores saved tasks and user-confirmed results. A disconnected browser
shows stale values and disables writes until a fresh read succeeds. Service
restart does not automatically resume an observer. Explicit recovery fences an
abandoned collector and records a gap before a new baseline. Confirm the previous
observer is no longer running before using that action.

Task writes check the current control version against concurrent CLI/window
changes. Usage updates do not invalidate pause controls. Durable action keys
prevent repeated clicks from performing the same action twice. Ambiguous actions
are reported rather than automatically retried.

The service binds only 127.0.0.1 and checks Host, Origin, CSRF and bounded typed
request bodies. No arbitrary shell or browser-supplied source URL exists. Native
pickers use constant local dialogs; cancellation makes no task transition. Private
names, setup paths and start commands live in a separate UI database, outside
measurement exports. Keep that database with the measurement Store when moving
this local installation; do not share it as a measurement report.

Portable harness pairs use the separate [harness configuration workflow](harness-config.md). Select the shared comparison file, then explicitly bind an existing reviewed local template. Import creates no measurement registration.

## Agent application comparisons

Explicit format-2 `agent_applied` comparisons preserve assignment and select an
existing checkout/worktree and native product. Prepare context, request a fresh
interactive native session or copy the fallback, and let its own agent apply the
procedure directly with native permissions. The UI reviews actual files afterward;
there is no server publish approval or agent execution control.

macOS Terminal opening with an installed CLI has synthetic wiring coverage and
unverified native acceptance. Other platforms and desktop prompt deep links are
unsupported. Checks remain agent reported and file verification covers the reported
set. Abandonment invalidates the attempt; stop the agent in the native window.
Existing edits remain. Copy populated harness-connect guidance to a separate fresh
working session. Identity/loading/source gates remain explicit and qualification
pending. See [the flow and limits](harness-config.md#6-agent-application-format-2).
