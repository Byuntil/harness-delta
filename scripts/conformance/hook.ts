export function rejectBypass(argv: readonly string[]): void {
  if (argv.some(argument => argument.includes('dangerously-bypass-hook-trust'))) throw new Error('bypass_rejected');
}

/**
 * Non-Windows display of Codex rust-v0.158.0
 * `synthetic_layer_path("<session-flags>/config.toml")`, resolved against `/`.
 * Source-derived and unverified at runtime.
 */
const SESSION_FLAGS_CONFIG_PATH = '/<session-flags>/config.toml';
/**
 * `hook_event_key_label(SessionStart)` in Codex rust-v0.158.0.
 * Source-derived and unverified at runtime.
 */
const SESSION_START_EVENT_LABEL = 'session_start';
const trustedHashPattern = /^sha256:[0-9a-f]{64}$/;
const commandPattern = /^\/(?:[A-Za-z0-9._+-]+\/)*[A-Za-z0-9._+-]+$/;

function assertTomlSafe(value: string): void {
  if (value.includes('"') || value.includes('\\')) throw new Error('invalid_hook_trust');
}

export function hookTrustArguments(input: { command: string; trustedHash: string }): readonly string[] {
  if (!trustedHashPattern.test(input.trustedHash)) throw new Error('invalid_hook_trust');
  if (!commandPattern.test(input.command) || input.command.split('/').includes('..')) throw new Error('invalid_hook_command');
  const stateKey = `${SESSION_FLAGS_CONFIG_PATH}:${SESSION_START_EVENT_LABEL}:0:0`;
  assertTomlSafe(stateKey);
  assertTomlSafe(input.command);
  assertTomlSafe(input.trustedHash);
  const sessionStart = `[{hooks=[{type="command",command="${input.command}"}]}]`;
  const args = [
    '-c', `hooks.SessionStart=${sessionStart}`,
    '-c', `hooks.state."${stateKey}".trusted_hash="${input.trustedHash}"`,
  ];
  rejectBypass(args);
  rejectBypass([input.command]);
  return args;
}
