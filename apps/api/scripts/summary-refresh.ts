// The operator's read of the content summaries' refresh (docs/specs/006-document/document-storage.md "Refreshing the
// summaries"). Reads D1 through wrangler, never writes:
//
//   node --import ../../scripts/ts-source-hooks.mjs scripts/summary-refresh.ts report (--local | --remote) [--run]
//
// Without --run it reads the dry run (complete when every document is checked); with it, the run (every document
// written). Exit 0 when complete with no failure, 1 when not yet, 2 on a usage or wrangler error.

import { execFileSync } from 'node:child_process';
import { assertSelect } from '../src/document-room/content-move-plan';
import {
  formatSummaryReport,
  SUMMARY_REPORT_QUERIES,
  summaryReportOf,
  type SummaryRefreshRow,
} from '../src/summary-refresh/summary-refresh-report';

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
  if (!answer?.success) throw new Error('summary-refresh: wrangler did not answer the read');
  return answer.results;
}

function main(args: string[]): number {
  const remote = args.includes('--remote');
  if (args[0] !== 'report' || (!remote && !args.includes('--local'))) {
    console.error('usage: summary-refresh report (--local | --remote) [--run]');
    return 2;
  }
  const target = remote ? '--remote' : '--local';
  const rows = wranglerSelect(target, SUMMARY_REPORT_QUERIES[0]) as SummaryRefreshRow[];
  const [{ n }] = wranglerSelect(target, SUMMARY_REPORT_QUERIES[1]) as [{ n: number }];
  const report = summaryReportOf(rows, n, args.includes('--run') ? 'run' : 'dry');
  console.log(formatSummaryReport(report));
  return report.complete ? 0 : 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
