import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { confirmationPlan, readConfirmation, renderConfirmation } from '../scripts/conformance/confirm.js';
import { matchExactSessionFilename } from '../scripts/conformance/filename.js';
import { hookTrustArguments, rejectBypass } from '../scripts/conformance/hook.js';

const lines = [
  'command: /synthetic/codex-not-run',
  'options: -c check_for_update_on_startup=false',
  'synthetic request: one short turn',
  'model: synthetic',
  'settings: defaults',
  'plan: initial and resume',
  'limits: 1 turn, 30 seconds',
  'warmup and internal requests may exceed the requested turn',
  'source selection: exact filename',
  'product-created files: new session file only',
  'report stores: labels and check outcomes',
];

test('confirmation text discloses the plan and rejects reused or piped answers', () => {
  const plan = confirmationPlan(lines);
  const rendered = renderConfirmation(plan);
  for (const line of lines) expect(rendered).toContain(line);
  expect(rendered).toContain("The user's own trusted hooks may still run; this invocation does not disable them.");
  expect(rendered).not.toContain('--yes');
  expect(rendered).not.toContain('dangerously-bypass-hook-trust');
  expect(rendered).not.toContain('SECRET_PROMPT');
  expect(readConfirmation(plan, { readLine: () => 'confirm' }, null)).toBe('confirmed');
  for (const answer of ['yes', 'y', '', null]) {
    expect(readConfirmation(plan, { readLine: () => answer }, null)).toBe('aborted');
  }
  expect(readConfirmation(plan, { readLine: () => 'confirm' }, { fingerprint: plan.fingerprint })).toBe('aborted');
});

test('filename matching is product-specific and reads names only', () => {
  const id = '11112222-3333-4444-5555-666677778888';
  const codex = `rollout-2026-01-01T00-00-00-${id}.jsonl`;
  expect(matchExactSessionFilename(['other.jsonl'], id, 'codex')).toBe('none');
  expect(matchExactSessionFilename([`${id}.jsonl`], id, 'codex')).toBe('none');
  expect(matchExactSessionFilename([codex], id, 'codex')).toBe('match');
  expect(matchExactSessionFilename([codex, `rollout-later-${id}.jsonl`], id, 'codex')).toBe('ambiguous');
  expect(matchExactSessionFilename([codex], '', 'codex')).toBe('none');
  expect(matchExactSessionFilename([codex], '444455556666', 'codex')).toBe('none');
  expect(matchExactSessionFilename([codex], '4444-5555-666677778888', 'codex')).toBe('none');
  expect(matchExactSessionFilename(['other.jsonl'], 's1', 'claude_code')).toBe('none');
  expect(matchExactSessionFilename(['s1.jsonl'], 's1', 'claude_code')).toBe('match');
  expect(matchExactSessionFilename(['s1.jsonl', 's1.jsonl'], 's1', 'claude_code')).toBe('ambiguous');
  expect(matchExactSessionFilename([codex], 's1', 'claude_code')).toBe('none');
  expect(matchExactSessionFilename(['.jsonl'], '', 'claude_code')).toBe('none');
  expect(readFileSync(new URL('../scripts/conformance/filename.ts', import.meta.url), 'utf8')).not.toContain('node:fs');
});

test('hook trust arguments use the source-derived state key and reject unsafe hashes and commands', () => {
  const hash = `sha256:${'a'.repeat(64)}`;
  const stateKey = '/<session-flags>/config.toml:session_start:0:0';
  expect(stateKey.includes('"')).toBe(false);
  expect(stateKey.includes('\\')).toBe(false);
  expect(hookTrustArguments({ command: '/synthetic/hook', trustedHash: hash })).toEqual([
    '-c', 'hooks.SessionStart=[{hooks=[{type="command",command="/synthetic/hook"}]}]',
    '-c', `hooks.state."${stateKey}".trusted_hash="${hash}"`,
  ]);
  expect(() => hookTrustArguments({ command: '/synthetic/hook', trustedHash: 'a'.repeat(64) })).toThrow(/^invalid_hook_trust$/);
  expect(() => hookTrustArguments({ command: '/synthetic/hook', trustedHash: `sha256:${'A'.repeat(64)}` })).toThrow(/^invalid_hook_trust$/);
  expect(() => hookTrustArguments({ command: '/synthetic/hook', trustedHash: 'sha256:abc' })).toThrow(/^invalid_hook_trust$/);
  for (const command of ['echo hello', '/tmp/hook;id', '/tmp/hook"x', 'relative/hook', '/tmp/a b', '/tmp/hook\\x', '/tmp/../hook']) {
    expect(() => hookTrustArguments({ command, trustedHash: hash })).toThrow(/^invalid_hook_command$/);
  }
  expect(() => rejectBypass(['--dangerously-bypass-hook-trust'])).toThrow(/^bypass_rejected$/);
  expect(readFileSync(new URL('../scripts/conformance/hook.ts', import.meta.url), 'utf8')).not.toContain('node:fs');
});
