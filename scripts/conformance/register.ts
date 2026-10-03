import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lookupFileProfile, type CodexAdmission } from '../../src/adapter-profiles.js';
import { assessAdmission } from './admission.js';
import { compareCandidate, lookupCandidate } from './candidate.js';
import { evidenceIdentity } from './evidence.js';

/** Explicit developer action: writes reviewed application data, never runtime user configuration. */
export function registrationMain(args: readonly string[], root = process.cwd(), write: (text: string) => void = text => { process.stdout.write(text); }): number {
  if ((args.length !== 4 && args.length !== 5) || args[0] !== '--candidate' || args[2] !== '--report' ||
      !args[1] || !args[3] || (args.length === 5 && args[4] !== '--register')) {
    write('usage: profile:admit --candidate <exact version> --report <report.json> [--register]\n'); return 2;
  }
  const candidate = lookupCandidate(args[1]);
  if (!candidate || lookupFileProfile('codex', candidate.previousVersion) === 'unsupported') {
    write('unknown_candidate_or_previous_profile\n'); return 2;
  }
  const identity = evidenceIdentity(root, candidate);
  let report: unknown;
  try { report = JSON.parse(readFileSync(args[3], 'utf8')) as unknown; }
  catch { write('invalid_report\n'); return 2; }
  const assessment = assessAdmission(candidate, report, identity);
  write(`${JSON.stringify({ candidate: candidate.version, previous: candidate.previousVersion, differences: compareCandidate(candidate), ...assessment })}\n`);
  if (!assessment.eligible) return 1;
  const entry: CodexAdmission = { version: candidate.version, ...identity, scenario: 'exec_initial_resume' };
  if (args[4] !== '--register') { write('eligible_for_explicit_registration: rerun with --register after evidence review\n'); return 0; }
  const path = join(root, 'src/codex-admissions.json');
  const entries = JSON.parse(readFileSync(path, 'utf8')) as CodexAdmission[];
  if (entries.some(value => value.version === candidate.version)) { write('already_registered: review existing evidence before replacing\n'); return 1; }
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify([...entries, entry], null, 2)}\n`, { flag: 'wx' });
  renameSync(temporary, path);
  write('registered_in_source: run npm run check and rebuild before collection\n');
  return 0;
}
const invoked = process.argv[1];
if (invoked !== undefined && import.meta.url === pathToFileURL(invoked).href) {
  try { process.exitCode = registrationMain(process.argv.slice(2)); }
  catch { process.stdout.write('registration_error\n'); process.exitCode = 1; }
}
