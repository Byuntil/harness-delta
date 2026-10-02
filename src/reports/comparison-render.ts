import { renderReadableComparison } from './comparison-readable.js';
import type { ComparisonReport } from './comparison.js';
import type { InvalidatedReport } from './comparison-contracts.js';

export function renderComparisonReport(report: ComparisonReport | InvalidatedReport, format: string): string {
  const json = JSON.stringify(report, null, 2) + '\n';
  if (format === 'json') return json;
  if (format === 'markdown') return '# Assignment comparison report\n\nSynthetic descriptions only. Partial observations are not complete task totals. No inferential adoption decision.\n\n```json\n' + json + '```\n';
  if (format === 'markdown-readable') return renderReadableComparison(report);
  throw new Error('invalid_format');
}
