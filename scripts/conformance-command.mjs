// Build and run the manually selected command with the same Node runtime. No product
// process is started by compilation, tests, installation or profile admission.
import { spawnSync } from 'node:child_process';
const command = process.argv[2];
if (!['runner', 'register'].includes(command) || Number(process.versions.node.split('.')[0]) !== 24) {
  process.stderr.write('Node 24 and an explicit runner/register command are required.\n');
  process.exit(2);
}
const build = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'scripts/conformance/tsconfig.json'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const result = spawnSync(process.execPath, [`.harness-delta/conformance-build/scripts/conformance/${command}.js`, ...process.argv.slice(3)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
