const codexIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchExactSessionFilename(
  names: readonly string[],
  sessionId: string,
  product: 'codex' | 'claude_code',
): 'none' | 'match' | 'ambiguous' {
  if (sessionId.length === 0 || (product === 'codex' && !codexIdPattern.test(sessionId))) return 'none';
  const codexName = new RegExp(`^rollout-.+-${escapeRegExp(sessionId)}\\.jsonl$`);
  const matches = names.filter(name => product === 'codex' ? codexName.test(name) : name === `${sessionId}.jsonl`);
  if (matches.length === 0) return 'none';
  if (matches.length === 1) return 'match';
  return 'ambiguous';
}
