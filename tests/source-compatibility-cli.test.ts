import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { main } from '../src/cli.js';
import { Lifecycle } from '../src/lifecycle.js';
import { Store } from '../src/store.js';

test.each([['codex', '0.161.0'], ['claude_code', '2.1.292'], ['claude_code', '2.1.293']])('CLI links recent regular %s, displays trust and persists invalidation across commands', async (product, version) => {
  const root = mkdtempSync(join(tmpdir(), 'compatibility-cli-')); const db = join(root, 'db.sqlite');
  const store = new Store(db);
  const life = new Lifecycle(store); life.registerProject('p', root);
  life.createTask('p', 't', { type: 'feature', expected_size: 'small', assignee: 'u', product, model: 'synthetic', criterion_ids: ['c'] }); store.close();
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    expect(await main(['--db', db, 'session', 'link', 's', '--task', 't', '--source', join(root, 'absent'), '--product', product, '--version', version])).toBe(0);
    expect(String(stdout.mock.calls.at(-1)?.[0])).toContain('compatibility_unverified');
    expect(await main(['--db', db, 'compatibility', 'invalidate', '--product', product, '--version', version, '--source', 'file'])).toBe(0);
    expect(String(stdout.mock.calls.at(-1)?.[0])).toContain('invalidated');
    expect(await main(['--db', db, 'compatibility', 'inspect', '--product', product, '--version', version, '--source', 'file'])).toBe(0);
    expect(String(stdout.mock.calls.at(-1)?.[0])).toContain('invalidated');
    expect(await main(['--db', db, 'session', 'link', 'new', '--task', 't', '--source', join(root, 'absent'), '--product', product, '--version', version])).toBe(2);
    expect(String(stderr.mock.calls.at(-1)?.[0])).toContain('compatibility_invalidated');
    expect(await main(['--db', db, 'compatibility', 'status'])).toBe(0);
    expect(String(stdout.mock.calls.at(-1)?.[0])).not.toContain(root);
  } finally { stdout.mockRestore(); stderr.mockRestore(); rmSync(root, { recursive: true, force: true }); }
});
