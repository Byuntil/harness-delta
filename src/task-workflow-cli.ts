import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { beginAssignedWorkflow, finishAssignedWorkflow, workflowStatus, runAssignedWorkflow, type WorkflowAdapter } from './task-workflow.js';
import { createCodexWorkflowAdapter, CodexWorkflowExecutionSchema } from './codex-workflow-adapter.js';
import { createClaudeWorkflowAdapter, ClaudeWorkflowExecutionSchema, stopClaudeWorkflow } from './claude-workflow-adapter.js';
import { stopCodexWorkflow } from './codex-workflow-journal.js';
import type { Outcome } from './lifecycle.js';
import type { Store } from './store.js';
import { createComparisonSnapshot } from './reports/comparison-snapshot.js';
import type { ComparisonSnapshotRequest } from './reports/comparison-contracts.js';

const readConfig = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;
export interface WorkflowCommandDependencies { codexAdapter?: (store:Store,execution:unknown)=>WorkflowAdapter; claudeAdapter?: (store:Store,execution:unknown)=>WorkflowAdapter }
export function registerTaskWorkflowCommands(program: Command, store: () => Store, print: (value: unknown) => void, dependencies:WorkflowCommandDependencies={}) {
  const workflow = program.command('workflow').description('Assigned task lifecycle; native execution requires qualified adapters');
  const codex=workflow.command('codex').description('Codex task execution and own-response collection');
  for(const operation of ['launch','resume','link','collect'] as const){
    codex.command(operation).requiredOption('--config <file>').requiredOption('--runtime <file>').requiredOption('--execution <file>')
      .action(async(options:{config:string;runtime:string;execution:string})=>{
        const execution=CodexWorkflowExecutionSchema.parse(readConfig(options.execution));if(execution.operation!==operation)throw new Error('workflow_operation_mismatch');
        const db=store();const result=await runAssignedWorkflow(db,readConfig(options.config),(dependencies.codexAdapter??createCodexWorkflowAdapter)(db,execution),readConfig(options.runtime));print(result);
        if(result.adapter_result?.state==='failed')throw new Error('codex_workflow_failed');
      });
  }
  const claude=workflow.command('claude').description('Claude assigned task execution with request trace collection');
  claude.command('launch').requiredOption('--config <file>').requiredOption('--runtime <file>').requiredOption('--execution <file>')
    .action(async(options:{config:string;runtime:string;execution:string})=>{
      const execution=ClaudeWorkflowExecutionSchema.parse(readConfig(options.execution));
      const db=store();const result=await runAssignedWorkflow(db,readConfig(options.config),(dependencies.claudeAdapter??createClaudeWorkflowAdapter)(db,execution),readConfig(options.runtime));print(result);
      if(result.adapter_result?.state==='failed')throw new Error('claude_workflow_failed');
    });
  claude.command('stop <run-id>').action((runId:string)=>{print(stopClaudeWorkflow(store(),runId));});
  codex.command('stop <run-id>').action((runId:string)=>{print(stopCodexWorkflow(store(),runId));});
  workflow.command('status <protocol-id>').action((protocolId: string) => { print(workflowStatus(store(), protocolId)); });
  workflow.command('begin').requiredOption('--config <file>').requiredOption('--runtime <file>')
    .action((options: { config: string; runtime: string }) => {
      // Measurement output contains hashes/IDs only, never instruction text.
      print(beginAssignedWorkflow(store(), readConfig(options.config), readConfig(options.runtime)).receipt);
    });
  workflow.command('finish <task-id>').requiredOption('--outcome <success|failed|aborted>').option('--met <ids...>', 'fulfilled criterion IDs', [])
    .action((taskId: string, options: { outcome: Outcome; met: string[] }) => { print(finishAssignedWorkflow(store(), taskId, options.outcome, options.met)); });
  workflow.command('report <protocol-id>').requiredOption('--id <report-id>').requiredOption('--cutoff <UTC>').requiredOption('--reason <reason>').option('--supersedes <report-id>')
    .action((protocolId: string, options: { id: string; cutoff: string; reason: ComparisonSnapshotRequest['revisionReason']; supersedes?: string }) => {
      print(createComparisonSnapshot(store(), { protocolId, reportId: options.id, cutoff: options.cutoff, revisionReason: options.reason,
        ...(options.supersedes ? { supersedesReportId: options.supersedes } : {}) }));
    });
}
