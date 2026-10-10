import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';

test.each([['26.0.0', 2, 'unsupported_node'], ['24.21.0', 3, 'build_required']] as const)(
  'first run rejects %s before importing the missing build', (version, code, error) => {
    const root = mkdtempSync(join(tmpdir(), 'hm-first-run-'));
    try {
      const launcher = new URL('../scripts/hm.mjs', import.meta.url).href;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e',
        `import {launch} from ${JSON.stringify(launcher)}; process.exitCode=await launch([],new URL(${JSON.stringify(pathToFileURL(root + '/').href)}),${JSON.stringify(version)});`], { encoding: 'utf8' });
      expect(result.status).toBe(code);
      expect(JSON.parse(result.stderr)).toMatchObject({ error });
    } finally { rmSync(root, { recursive: true, force: true }); }
  },
);

test('installed Node24 launcher preserves CLI help and arguments', () => {
  const result = spawnSync(process.execPath, ['scripts/hm.mjs', '--help'], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Usage: hm');
});

test('a build without installed dependencies has a distinct prerequisite result', () => {
  const root = mkdtempSync(join(tmpdir(), 'hm-first-run-'));
  try {
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'cli.js'), 'throw new Error("entry must not be imported");');
    const launcher = new URL('../scripts/hm.mjs', import.meta.url).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import {launch} from ${JSON.stringify(launcher)}; process.exitCode=await launch([],new URL(${JSON.stringify(pathToFileURL(root + '/').href)}));`], { encoding: 'utf8' });
    expect(result.status).toBe(4);
    expect(JSON.parse(result.stderr)).toMatchObject({ error: 'dependencies_required' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
