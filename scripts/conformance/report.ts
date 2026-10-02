import type { CollaborationMode, MultiAgentVersion } from '../../src/codex-rollout-policy.js';
import { chmodSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CatalogTraversal } from './catalog.js';
import { checkNames, type CheckMap, type CheckName, type CheckOutcome } from './checks.js';

export interface ExpectationDiff {
  readonly check: CheckName;
  readonly expected: CheckOutcome;
  readonly actual: CheckOutcome;
}

export interface ConformanceReport {
  readonly modes: { readonly collaboration: readonly CollaborationMode[]; readonly multiAgent: readonly MultiAgentVersion[] };
  readonly version: string;
  readonly scenario: string;
  readonly matchedPaths: readonly string[];
  readonly unknownNameCount: number;
  readonly recordCounts: Readonly<Record<string, number>>;
  readonly eventCounts: Readonly<Record<string, number>>;
  readonly checks: CheckMap;
  readonly expectationDifferences: readonly ExpectationDiff[];
  readonly priorDifferences: readonly ExpectationDiff[];
  readonly limitExceeded: boolean;
  readonly blocked: boolean;
}

function differences(actual: CheckMap, expected: Partial<CheckMap> | CheckMap, onlyDefined: boolean): ExpectationDiff[] {
  const rows: ExpectationDiff[] = [];
  for (const check of checkNames) {
    const wanted = expected[check];
    if (onlyDefined && wanted === undefined) continue;
    if (wanted !== undefined && wanted !== actual[check]) rows.push({ check, expected: wanted, actual: actual[check] });
  }
  return rows;
}

export function projectReport(input: {
  modes?: ConformanceReport['modes'];
  version: string;
  scenario: string;
  traversal: CatalogTraversal;
  checks: CheckMap;
  expectations: Partial<CheckMap>;
  prior: { checks: CheckMap } | null;
  blocked: boolean;
}): ConformanceReport {
  return {
    modes: input.modes ?? { collaboration: [], multiAgent: [] },
    version: input.version,
    scenario: input.scenario,
    matchedPaths: input.traversal.matchedPaths,
    unknownNameCount: input.traversal.unknownNameCount,
    recordCounts: input.traversal.recordCounts,
    eventCounts: input.traversal.eventCounts,
    checks: input.checks,
    expectationDifferences: differences(input.checks, input.expectations, true),
    priorDifferences: input.prior === null ? [] : differences(input.checks, input.prior.checks, false),
    limitExceeded: input.traversal.limitExceeded,
    blocked: input.blocked,
  };
}

export function writeRestrictedJson(directory: string, fileName: string, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  const finalPath = join(directory, fileName);
  const temporary = join(directory, `.${fileName}.${process.pid}.tmp`);
  writeFileSync(temporary, body, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, finalPath);
  chmodSync(finalPath, 0o600);
}

export function writeRestrictedReport(directory: string, report: ConformanceReport): void {
  writeRestrictedJson(directory, 'conformance-report.json', report);
}
