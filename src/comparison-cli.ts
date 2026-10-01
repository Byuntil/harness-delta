import { readFileSync } from 'node:fs';
import { createComparisonSnapshot, readComparisonSnapshot } from './reports/comparison-snapshot.js';
import { renderComparisonReport } from './reports/comparison-render.js';
import type { ComparisonSnapshotRequest } from './reports/comparison-contracts.js';
import type { Command } from 'commander';
import { assignTask } from './allocation.js';
import { freezeProtocol, registerProtocol, registerVariant, showProtocol, showVariant } from './comparison.js';
import { confirmConfiguration, configurationHistory } from './config-confirmation.js';
import type { SelectedArtifact } from './config-confirmation.js';
import type { Store } from './store.js';

const readConfig = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

export function registerComparisonCommands(program: Command, store: () => Store, print: (value: unknown) => void): void {
  const variant = program.command('variant').description('Register immutable harness configurations');
  variant.command('register').requiredOption('--config <file>').action((options: { config: string }) => { registerVariant(store(), readConfig(options.config)); });
  variant.command('show <id>').action((id: string) => { print(showVariant(store(), id)); });
  const comparison = program.command('comparison').description('Synthetic-only randomized workflow; real experiments disabled');
  comparison.command('register').requiredOption('--config <file>').action((options: { config: string }) => { registerProtocol(store(), readConfig(options.config)); });
  comparison.command('freeze <id>').action((id: string) => { freezeProtocol(store(), id, new Date().toISOString()); });
  comparison.command('show <id>').action((id: string) => { print(showProtocol(store(), id)); });
  comparison.command('assign').requiredOption('--config <file>').action((options: { config: string }) => { print(assignTask(store(), readConfig(options.config), { discloseReports: ids => { print({ invalidating_reports: ids }); } })); });
  comparison.command('snapshot').command('create <protocol-id>')
    .requiredOption('--id <report-id>').requiredOption('--cutoff <UTC>').requiredOption('--reason <reason>')
    .option('--supersedes <report-id>').action((protocolId: string, options: { id: string; cutoff: string; reason: ComparisonSnapshotRequest['revisionReason']; supersedes?: string }) => {
      print(createComparisonSnapshot(store(), { reportId: options.id, protocolId, cutoff: options.cutoff, revisionReason: options.reason,
        ...(options.supersedes ? { supersedesReportId: options.supersedes } : {}) }));
    });
  comparison.command('report <report-id>').option('--format <json|markdown>', 'output format', 'json')
    .action((reportId: string, options: { format: string }) => { process.stdout.write(renderComparisonReport(readComparisonSnapshot(store(), reportId), options.format)); });
  const task = program.commands.find(command => command.name() === 'task');
  if (!task) throw new Error('task_commands_missing');
  task.command('confirm-config').requiredOption('--config <file>')
    .option('--artifact <id=path...>', 'Explicitly selected instruction artifacts, read locally and never retained')
    .action((options: { config: string; artifact?: string[] }) => {
      const artifacts: SelectedArtifact[] | undefined = options.artifact?.map(value => {
        const separator = value.indexOf('=');
        if (separator < 1 || separator === value.length - 1) throw new Error('invalid_selected_artifact');
        return { artifactId: value.slice(0, separator), path: value.slice(separator + 1) };
      });
      confirmConfiguration(store(), readConfig(options.config), new Date().toISOString(), artifacts);
    });
  task.command('config-history <id>').action((id: string) => { print(configurationHistory(store(), id)); });
}
