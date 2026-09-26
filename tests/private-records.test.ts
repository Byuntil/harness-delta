import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const guard = fileURLToPath(new URL("../scripts/check-private-records.mjs", import.meta.url));

test("privacy guard permits ignored local records but rejects force-added records", () => {
  const root = mkdtempSync(join(tmpdir(), "harness-privacy-"));
  // Git hooks export repository-local variables. Foreign-repository commands must
  // not inherit them, or even `git init` can mutate the caller's repository.
  const env = { ...process.env };
  const localVars = spawnSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8" });
  expect(localVars.status, localVars.stderr).toBe(0);
  for (const name of localVars.stdout.trim().split("\n")) delete env[name];
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env });
    expect(result.status, result.stderr).toBe(0);
  };
  const check = () => spawnSync(process.execPath, [guard], { cwd: root, encoding: "utf8", env });
  try {
    git("init", "--quiet");
    writeFileSync(join(root, ".gitignore"), "/.harness-delta/\n");
    mkdirSync(join(root, ".harness-delta", "work"), { recursive: true });
    writeFileSync(join(root, ".harness-delta", "work", "status.md"), "Synthetic handoff\n");
    git("add", ".gitignore");
    const clean = check();
    expect(clean.status, clean.stderr).toBe(0);
    git("add", "--force", ".harness-delta/work/status.md");
    const leaked = check();
    expect(leaked.status).toBe(1);
    expect(leaked.stderr).toContain("Local records must not be tracked");
    expect(leaked.stderr).not.toContain("Synthetic handoff");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
