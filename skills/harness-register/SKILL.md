---
name: harness-register
description: Use when a user wants to package explicitly selected existing harness instructions and related tool files as an immutable harness-config version.
---

# Register a harness version

Use a built Harness Delta checkout with Node 24. This reference package can be
copied to a skill directory; it requires no personal plugin or installed global CLI.

Ask for missing harness ID, version, policy version, selected files and the
README source. Keep the selection explicit. An instruction mentioning a tool
does not authorize running it. Choose the primary instruction's target as
`harness.md`; preserve relevant relative file layout. Do not generate a replacement
harness, modify original files, infer a dependency closure or install the skill.

Create an input JSON file from the explicit selection:

```json
{
  "schema_version": 1,
  "harness_id": "search",
  "version": "baseline",
  "policy_version": "policy-v1",
  "readme_path": "harness-notes.md",
  "artifacts": [
    {"artifact_id":"instruction","role":"instruction","source_path":"policy.md","target_path":"harness.md"},
    {"artifact_id":"search-tool","role":"tool","source_path":"scripts/search.py","target_path":"scripts/search.py"}
  ]
}
```

All source_path and target_path values are relative to the explicit project root.
For a derived version, add `"base":{"path":"harness-config/baseline/manifest.json"}`.
The README must explain purpose, application from the project root, manual
prerequisites, selected-file limits and manual verification. Original commands
and references are preserved. Unselected dependencies remain manual prerequisites.

Run the helper using the location of this skill's script:

```sh
node scripts/run.mjs --harness-delta /path/to/harness-delta --root /path/to/project --input /path/to/register-input.json
```

The command writes `harness-config/<version>/harness.md`, `README.md`,
`manifest.json` and only selected supporting files. Same inputs return
`already_registered`; changed bytes under an existing version fail with
`harness_version_conflict`. Choose a new explicit version for changed contents.
Missing files, unsafe paths, symlinks and unresolved inline local Markdown links
block publication. The supported inline link check is conservative and does not
validate command strings, reference-style links, dependencies or executable behavior.

Report the generated relative paths and integrity hashes. Explain that snapshot
integrity does not prove native instruction loading or tool execution. No
measurement registration, DB operation, session access or model call is performed.

For agent application, the selected `harness.md` is the application procedure and
included tools are executed from the pinned bundle in a qualified confined draft.
They are not automatically copied back to `source_path`. Registration keeps the
original files; it does not run the procedure or validate native execution safety.
Use an explicit version-2 `agent_applied` comparison for this mode.
