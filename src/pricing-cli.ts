import type { Command } from 'commander';
import { readObservedCostReport } from './observed-cost-report.js';
import type { LegacyInputBasis } from './pricing.js';
import type { Store } from './store.js';

export function registerObservedCostCommand(prices: Command, store: () => Store, print: (value: unknown) => void): void {
  prices.command('estimate-task <task-id>')
    .description('Partial standardized estimate from recorded task usage; no complete cost or billing claim')
    .requiredOption('--price-table <id>', 'Explicit immutable comparison reference rates')
    .requiredOption('--cutoff <UTC>', 'Exclusive observation cutoff')
    .option('--input-basis <basis>', 'output-only-v1 or explicit cache-read-remainder-ordinary-v1 assumption', 'output-only-v1')
    .action((taskId: string, options: { priceTable: string; cutoff: string; inputBasis: LegacyInputBasis }) => {
      print(readObservedCostReport(store(), taskId, options.priceTable, options.cutoff, options.inputBasis));
    });
}
