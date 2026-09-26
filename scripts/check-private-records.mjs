import { execFileSync } from "node:child_process";

try {
  const tracked = execFileSync(
    "git", ["ls-files", "--cached", "-z", "--", ".harness-delta"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (tracked.length > 0) {
    console.error("Local records must not be tracked. Remove .harness-delta/ paths from the Git index.");
    process.exitCode = 1;
  } else {
    console.log("Local-record index check passed.");
  }
} catch {
  console.error("Cannot verify local records. Run this check from the repository root with Git available.");
  process.exitCode = 1;
}
