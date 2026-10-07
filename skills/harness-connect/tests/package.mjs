import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';

const skill = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(skill, '../..');
const entry = readFileSync(join(skill, 'SKILL.md'), 'utf8');
const english = readFileSync(join(repo, 'docs/runbooks/harness-connect.md'), 'utf8');
const korean = readFileSync(join(repo, 'docs/runbooks/harness-connect.ko.md'), 'utf8');
test('frontmatter and Codex UI YAML have supported fields and invocation metadata', () => {
  const frontmatter = entry.match(/^---\n([\s\S]*?)\n---\n/)[1];
  assert.ok(frontmatter.length < 2048);
  const metadata = yaml.load(frontmatter);
  assert.equal(metadata.name, 'harness-connect'); assert.equal(typeof metadata.description, 'string');
  assert.deepEqual(Object.keys(metadata).sort(), ['description', 'disable-model-invocation', 'hooks', 'name']);
  assert.equal(metadata['disable-model-invocation'], true);
  assert.deepEqual(Object.keys(metadata.hooks).sort(), ['PreToolUse', 'SubagentStart', 'SubagentStop']);
  for (const entries of Object.values(metadata.hooks)) {
    assert.equal(entries.length, 1); const hook = entries[0].hooks[0];
    assert.equal(hook.type, 'command'); assert.equal(hook.timeout, 10);
    assert.equal(hook.command, 'node "$CLAUDE_PROJECT_DIR/.claude/skills/harness-connect/scripts/claude-session-hook.mjs" record');
  }
  assert.equal(readFileSync(join(skill, 'scripts/claude-session-hook.mjs'), 'utf8'), readFileSync(join(repo, 'scripts/claude-session-hook.mjs'), 'utf8'));
  const config = yaml.load(readFileSync(join(skill, 'agents/openai.yaml'), 'utf8'));
  assert.equal(typeof config.interface.display_name, 'string');
  assert.ok(config.interface.short_description.length >= 25 && config.interface.short_description.length <= 64);
  assert.ok(config.interface.default_prompt.includes('$harness-connect'));
});
test('local reference links exist; bilingual invocation and command blocks agree', () => {
  const files = [join(skill, 'SKILL.md'), join(skill, 'references/support.md'),
    join(repo, 'docs/runbooks/harness-connect.md'), join(repo, 'docs/runbooks/harness-connect.ko.md')];
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^https:\/\//.test(match[1])) continue;
      assert.ok(existsSync(resolve(dirname(file), match[1].split('#')[0])), `missing link in ${file}`);
    }
  }
  const blocks = content => [...content.matchAll(/```(?:sh|text)\n([\s\S]*?)```/g)].map(m => m[1]);
  assert.deepEqual(blocks(english), blocks(korean));
});
test('copies to both project skill locations run without repository imports or global install', t => {
  const project = mkdtempSync(join(tmpdir(), 'harness-connect-install-fixture-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  for (const host of ['.agents', '.claude']) {
    const installed = join(project, host, 'skills/harness-connect'); cpSync(skill, installed, { recursive: true, errorOnExist: true, force: false });
    const reply = spawnSync(process.execPath, [join(installed, 'scripts/connect.mjs'), 'identity', '--product', 'codex'],
      { encoding: 'utf8', cwd: project, env: { PATH: process.env.PATH } });
    assert.equal(reply.status, 0); assert.deepEqual(JSON.parse(reply.stdout), { session_id: null, identity_basis: 'unavailable' });
  }
});
test('CLI rejects unknown options with fixed output and no private argument echo', () => {
  const reply = spawnSync(process.execPath, [join(skill, 'scripts/connect.mjs'), 'inspect', '--unexpected', 'PRIVATE_CONTENT'],
    { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(reply.status, 1);
  assert.deepEqual(JSON.parse(reply.stdout), { status: 'blocked', reason_code: 'local_ui_request_failed', verified: false });
  assert.equal(reply.stderr, '');
});
