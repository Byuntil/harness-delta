# Claude hook recorder diagnostics

[한국어](claude-hook-diagnostics.ko.md)

Use this optional recorder mode to distinguish rejected lifecycle input from a
receipt write failure. It does not enable source admission, install hooks, start
collection, or prove that a native child finished or delivered every counter.
The default hook command remains silent. Existing receipt schema and identity,
project, process, source-path, deletion and version guards remain in force.

## Evidence boundaries

The current [official hook reference](https://code.claude.com/docs/en/hooks#hooks-in-skills-and-agents)
says invoked skill hooks remain registered for the session. Its
[SubagentStop input](https://code.claude.com/docs/en/hooks#subagentstop-input)
describes separate main-session and agent transcript paths. The
[environment reference](https://code.claude.com/docs/en/env-vars) describes
`CLAUDE_PID` for hook commands. These documents are expectations, not exact-version
native qualification. Missing stop receipts alone cannot distinguish no invocation,
invalid input, failed persistence or observation timing. A start receipt can still
support family discovery; absent stop evidence is neither zero usage nor proof
that a child is running, failed or complete.

## Opt-in command

Approve the exact project, fresh active task, linked root session, installed hook
bytes and bounded native actions before changing any real instrumentation. Preserve
completed trials and their receipts. Do not automatically install, reload, alter
trust/auth/global settings, launch or terminate a native process. Select Node 24.

For an explicitly selected session, add this option to an approved hook command:

```sh
node <skill-dir>/scripts/claude-session-hook.mjs record --diagnostics-session <selected-session-uuid>
```

A valid different session emits no diagnostic. Invalid identity or undecodable
stdin can emit a content-free reason under this explicitly scoped invocation;
its session attribution is unavailable. Unselected events and unrelated Bash
commands remain silent. Invalid diagnostic selection disables diagnostic output.
The option filters diagnostics only; it does not filter or expand ordinary receipt
recording. Limit any native probe through approved user actions, not an automatic
timeout or kill. Do not redirect or retain stdin, tool payloads or native debug logs.

One stderr JSON line reports only `schema_version`, a fixed `kind`, `status` and
`reason_code`. It contains no identifiers, paths, timestamps, prompts, responses,
tool commands, counters or exception details. Stdout remains empty and `record`
returns zero. Example:

```json
{"schema_version":1,"kind":"subagent_stop","status":"rejected","reason_code":"agent_transcript_path_invalid"}
```

| Status | Meaning |
| --- | --- |
| `recorded` / `receipt_recorded` | This invocation created a receipt. Check its allowlisted metadata separately. |
| `ignored` / `receipt_exists` | The target path already exists. This does not validate its contents. |
| `ignored` / `session_forgotten` | Deletion suppressed the event. |
| `rejected` | Required input is invalid; no receipt was created. |
| `error` / `receipt_write_failed` | Receipt persistence failed; raw error details are suppressed. |

Rejection codes name `session_id`, `claude_pid`, `transcript_path`, `cwd`,
`tool_use_id`, `agent_id` or `agent_transcript_path` with `_invalid`. Non-object
JSON uses `hook_input_invalid`; malformed JSON uses `hook_input_invalid_json`;
stdin larger than 4 MiB uses `hook_input_too_large`. Undecodable stdin has `kind: null`.
No diagnostic still leaves hook loading/invocation and command startup unresolved.
Use only separately approved metadata observations to resolve that boundary.

## Synthetic verification

From a Node 24 checkout:

```sh
npm run build
npm test -- tests/claude-hook-diagnostics.test.ts tests/session-binding-claude.test.ts tests/session-binding-claude-api.test.ts
node --test skills/harness-connect/tests/*.mjs
npm run check
```

These checks use synthetic inputs and temporary receipt directories. They establish
recorder behavior, privacy, replay/deletion handling and existing binding guards.
They do not execute Claude, qualify exact native lifecycle behavior or counters,
reconstruct missing stop events, or change historical measurements.
