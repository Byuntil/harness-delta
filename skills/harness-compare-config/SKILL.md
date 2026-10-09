---
name: harness-compare-config
description: Use when a user wants a portable baseline-versus-modified comparison file from two existing immutable harness-config versions.
---

# Generate a portable comparison

Use a built Harness Delta checkout with Node 24. Read both version manifests
under the explicit project root. Select distinct existing versions with baseline
as A and modified as B; ask only for missing comparison ID, display name or arm
choices. Do not create a new harness or invent variants, statistical settings,
prices, completion criteria, credentials or runtime defaults.

Create this input JSON with the user's selected IDs:

```json
{
  "schema_version": 1,
  "id": "baseline-vs-v2",
  "name": "Baseline vs v2",
  "arm_a": "baseline",
  "arm_b": "v2"
}
```

Run the helper using the location of this skill's script:

```sh
node scripts/run.mjs --harness-delta /path/to/harness-delta --root /path/to/project --input /path/to/comparison-input.json
```

The command verifies both snapshots and writes
`harness-config/comparisons/<id>.json`. It includes ordered relative references,
whole-bundle hashes and a deterministic settings_hash; it contains no absolute
paths, DB identity, model choice or machine binding. Same inputs return
`already_generated`. A changed descriptor under an existing ID fails with
`shared_settings_conflict`; use a new explicit ID for a different comparison.

To connect on another PC, copy the repository's harness-config files, then use
Local UI → Setup → choose the comparison JSON. Select the registered local
project and an existing reviewed measurement template explicitly. Missing local
registration remains a blocker. The UI writes private immutable JSON under
`.harness-delta/setup`; new tasks pin that revision. Import does not start tasks,
execute tools, access sessions or launch agents/models. Snapshot integrity,
registration compatibility and native execution support remain separate facts.

Report relative output paths, hashes and manual prerequisites. Tool-only changes
affect bundle identity even if instruction hashes are unchanged. Original tools
stay in the project and are checked for the assigned arm before use; this feature
never installs or restores them. Complete costs and statistical adoption remain
unavailable under existing support gates.

## Explicit agent application

For project-specific agent application, select a new comparison ID and use
`"schema_version": 2` with `"application": "agent_applied"` in the input above.
The saved procedure and included scripts guide the applying agent; generated
project instructions have a separate output manifest. Original-tool matching is
retained for version 1 only. Existing descriptors are never migrated in place.
Use `harness-apply` after assignment. Current native execution and working-session
loading remain qualification-pending and fail closed.
