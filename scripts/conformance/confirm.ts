import { createHash } from 'node:crypto';

export interface ConfirmationPlan {
  readonly fingerprint: string;
  readonly lines: readonly string[];
}

const disclosure = "The user's own trusted hooks may still run; this invocation does not disable them.";

export function confirmationPlan(lines: readonly string[]): ConfirmationPlan {
  return { fingerprint: createHash('sha256').update(JSON.stringify(lines)).digest('hex'), lines };
}

export function renderConfirmation(plan: ConfirmationPlan): string {
  return [...plan.lines, disclosure].join('\n');
}

export function readConfirmation(
  plan: ConfirmationPlan,
  io: { readLine: () => string | null },
  previous: { fingerprint: string } | null,
): 'confirmed' | 'aborted' {
  if (plan.fingerprint.length === 0 || previous !== null) return 'aborted';
  return io.readLine() === 'confirm' ? 'confirmed' : 'aborted';
}
