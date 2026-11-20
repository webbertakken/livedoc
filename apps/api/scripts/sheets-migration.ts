// The operator's read of the Sheets migration's dry run (docs/specs/029-sheets/migration.md "How it runs"). Reads D1
// through wrangler, never writes:
//
//   node --import ../../scripts/ts-source-hooks.mjs scripts/sheets-migration.ts dry (--local | --remote)
//
// Exit 0 when every document is planned and none failed, 1 when not yet, 2 on a usage or wrangler error.

import { execFileSync } from 'node:child_process';
import { assertSelect } from '../src/document-room/content-move-plan';
import {
  DRY_REPORT_QUERIES,
  dryReportOf,
  formatDryReport,
  type DryRow,
} from '../src/sheets-migration/sheet-migration-report';

function wranglerSelect(
  target: '--local' | '--remote',
  statement: string,
): Record<string, unknown>[] {
  assertSelect(statement);
  const out = execFileSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', 'DB', target, '--json', '--command', statement],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const [answer] = JSON.parse(out) as { results: Record<string, unknown>[]; success: boolean }[];
  if (!answer?.success) throw new Error('sheets-migration: wrangler did not answer the read');
  return answer.results;
}

function main(args: string[]): number {
  const remote = args.includes('--remote');
  if (args[0] !== 'dry' || (!remote && !args.includes('--local'))) {
    console.error('usage: sheets-migration dry (--local | --remote)');
    return 2;
  }
  const target = remote ? '--remote' : '--local';
  const rows = wranglerSelect(target, DRY_REPORT_QUERIES[0]) as DryRow[];
  const [{ n }] = wranglerSelect(target, DRY_REPORT_QUERIES[1]) as [{ n: number }];
  const report = dryReportOf(rows, n);
  console.log(formatDryReport(report));
  return report.complete ? 0 : 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
