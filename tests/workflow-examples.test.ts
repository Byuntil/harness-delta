import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { AssignedWorkflowInputSchema, WorkflowRuntimeSchema } from '../src/task-workflow.js';
import { CodexWorkflowExecutionSchema, pinnedCodexWorkflowBinarySha } from '../src/codex-workflow-adapter.js';

const example = (name: string): unknown => JSON.parse(readFileSync(`examples/workflow/${name}`, 'utf8'));

test('quickstart example files match the workflow schemas', () => {
  expect(AssignedWorkflowInputSchema.safeParse(example('workflow.json')).success).toBe(true);
  expect(WorkflowRuntimeSchema.safeParse(example('runtime.json')).success).toBe(true);
  for (const [name, operation] of [['launch.json', 'launch'], ['resume.json', 'resume'], ['link.json', 'link'], ['collect.json', 'collect']] as const) {
    const parsed = CodexWorkflowExecutionSchema.parse(example(name));
    expect(parsed.operation).toBe(operation);
    expect(parsed.binary.sha256).toBe(pinnedCodexWorkflowBinarySha);
  }
});
