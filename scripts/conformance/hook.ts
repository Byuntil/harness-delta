import { createHash } from 'node:crypto';

export function rejectBypass(argv: readonly string[]): void {
  if (argv.some(argument => argument.includes('dangerously-bypass-hook-trust'))) throw new Error('bypass_rejected');
}

/**
 * Non-Windows display of Codex rust-v0.158.0
 * `synthetic_layer_path("<session-flags>/config.toml")`, resolved against `/`.
 * Source-derived; accepted by `codex exec` 0.158.0 in a live conformance run (2026-09-29).
 */
const SESSION_FLAGS_CONFIG_PATH = '/<session-flags>/config.toml';
/**
 * `hook_event_key_label(SessionStart)` in Codex rust-v0.158.0.
 * Source-derived; accepted by `codex exec` 0.158.0 in a live conformance run (2026-09-29).
 */
const SESSION_START_EVENT_LABEL = 'session_start';
/** `normalize_command_hook` default for SessionStart in Codex rust-v0.158.0. */
const SESSION_START_DEFAULT_TIMEOUT_SEC = 600;
const trustedHashPattern = /^sha256:[0-9a-f]{64}$/;
const commandPattern = /^\/(?:[A-Za-z0-9._+-]+\/)*[A-Za-z0-9._+-]+$/;

function assertTomlSafe(value: string): void {
  if (value.includes('"') || value.includes('\\')) throw new Error('invalid_hook_trust');
}

function assertCommand(command: string): void {
  if (!commandPattern.test(command) || command.split('/').includes('..')) throw new Error('invalid_hook_command');
}

/**
 * Canonical JSON of Codex rust-v0.158.0 `NormalizedHookIdentity` for one command
 * SessionStart handler without matcher, status message or context limit. TOML
 * serialization drops `None` fields; `version_for_toml` sorts keys. Source-derived;
 * accepted by `codex exec` 0.158.0 in a live conformance run (2026-09-29).
 */
export function sessionStartHookIdentity(command: string): string {
  assertCommand(command);
  return JSON.stringify({
    event_name: SESSION_START_EVENT_LABEL,
    hooks: [{ async: false, command, timeout: SESSION_START_DEFAULT_TIMEOUT_SEC, type: 'command' }],
  });
}

export function sessionStartTrustedHash(command: string): string {
  return `sha256:${createHash('sha256').update(sessionStartHookIdentity(command)).digest('hex')}`;
}

/**
 * Codex splits a `-c` key on every `.` without honoring quotes, so the dotted state
 * key must live inside the TOML value rather than the key path.
 */
export function hookTrustArguments(input: { command: string; trustedHash: string }): readonly string[] {
  if (!trustedHashPattern.test(input.trustedHash)) throw new Error('invalid_hook_trust');
  assertCommand(input.command);
  const stateKey = `${SESSION_FLAGS_CONFIG_PATH}:${SESSION_START_EVENT_LABEL}:0:0`;
  assertTomlSafe(stateKey);
  assertTomlSafe(input.command);
  assertTomlSafe(input.trustedHash);
  const sessionStart = `[{hooks=[{type="command",command="${input.command}"}]}]`;
  const args = [
    '-c', `hooks.SessionStart=${sessionStart}`,
    '-c', `hooks.state={"${stateKey}"={trusted_hash="${input.trustedHash}"}}`,
  ];
  rejectBypass(args);
  rejectBypass([input.command]);
  return args;
}
