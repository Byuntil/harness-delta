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
  version: string;
  scenario: string;
  traversal: CatalogTraversal;
  checks: CheckMap;
  expectations: Partial<CheckMap>;
  prior: { checks: CheckMap } | null;
  blocked: boolean;
}): ConformanceReport {
  return {
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

export function writeRestrictedReport(directory: string, report: ConformanceReport): void {
  const body = `${JSON.stringify(report)}\n`;
  const finalPath = join(directory, 'conformance-report.json');
  const temporary = join(directory, `.conformance-report.${process.pid}.tmp`);
  writeFileSync(temporary, body, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, finalPath);
  chmodSync(finalPath, 0o600);
}