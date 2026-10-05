import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommanderError } from 'commander';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { main } from '../src/cli.js';
import { describeCliError } from '../src/cli-errors.js';

test('fixed codes are shown with a hint; other messages fall back without echoing content', () => {
  expect(describeCliError(new Error('binary_mismatch'))).toEqual(['binary_mismatch', expect.stringMatching(/^hint: binary SHA-256/)]);
  expect(describeCliError(new Error('report_conflict'))).toEqual(['report_conflict']);
  expect(describeCliError(new Error("ENOENT: no such file or directory, open '/private/PRIVATE_SENTINEL'"))).toEqual(['input_or_state_error']);
  expect(describeCliError(new Error('UNIQUE constraint failed: comparison_confirmations.id'))).toEqual(['input_or_state_error']);
  expect(describeCliError('PRIVATE_SENTINEL')).toEqual(['input_or_state_error']);
});

test('schema errors show key paths and issue codes, never values or user-supplied keys', () => {
  const schema = z.strictObject({ run_id: z.string().min(1), nested: z.record(z.string(), z.number()) });
  const result = schema.safeParse({ run_id: '', nested: { 'PRIVATE SENTINEL/path': 'PRIVATE_VALUE' }, extra: 'PRIVATE_EXTRA' });
  const lines = describeCliError(result.error);
  expect(lines[0]).toBe('invalid_input');
  expect(lines.join('\n')).toContain('at run_id: too_small');
  expect(lines.join('\n')).not.toMatch(/PRIVATE/);
});

test('usage errors name missing options but do not echo unknown argv tokens', () => {
  expect(describeCliError(new CommanderError(1, 'commander.missingMandatoryOptionValue', "error: required option '--runtime <file>' not specified")))
    .toEqual(["invalid_command: required option '--runtime <file>' not specified", 'hint: run the command with --help for usage']);
  expect(describeCliError(new CommanderError(1, 'commander.unknownOption', "error: unknown option '--PRIVATE_SENTINEL'"))[0]).toBe('invalid_command: unknownOption');
});

let root: string; let errors: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cli-errors-')); errors = '';
  vi.spyOn(process.stderr, 'write').mockImplementation(value => { errors += String(value); return true; });
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => { vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

test('workflow CLI reports one actionable line per failure', async () => {
  const db = join(root, 'local.sqlite');
  expect(await main(['--db', db, 'workflow', 'begin', '--config', join(root, 'workflow.json')])).toBe(2);
  expect(errors).toBe("invalid_command: required option '--runtime <file>' not specified\nhint: run the command with --help for usage\n");
  errors = ''; const missing = join(root, 'PRIVATE_SENTINEL.json');
  expect(await main(['--db', db, 'workflow', 'begin', '--config', missing, '--runtime', missing])).toBe(2);
  expect(errors).toBe('config_file_unreadable\nhint: cannot read the --config file\n');
  errors = ''; writeFileSync(join(root, 'bad.json'), '{"PRIVATE_SENTINEL": ');
  expect(await main(['--db', db, 'workflow', 'begin', '--config', join(root, 'bad.json'), '--runtime', join(root, 'bad.json')])).toBe(2);
  expect(errors).toBe('config_file_invalid_json\nhint: the --config file is not valid JSON\n');
  errors = '';
  expect(await main(['--db', db, 'workflow', 'finish', 'task-1', '--outcome', 'success'])).toBe(2);
  expect(errors).toMatch(/^task_not_assigned\nhint: /);
});
