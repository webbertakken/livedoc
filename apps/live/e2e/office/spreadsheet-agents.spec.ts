import { createApiClient } from '@livedoc/api-client';
import { addSheet, changeSheet, createSpreadsheet, readSheet } from '@livedoc/agent-verbs';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';

// Agents in a spreadsheet (plan 0020 Phase 15; docs/specs/029-sheets/sheet-store.md "Built for agents in a
// spreadsheet"), against the real api: the agent engine the MCP and the CLI share makes a spreadsheet with named
// sheets, writes numbers, text, formulas and tick boxes by A1, shapes the sheet and charts it as a scatter with a
// Pareto line and axis titles; read_sheet answers the values and the chart; the editor draws it.

const READY = '[data-spreadsheet-surface="ready"]';

test('an agent makes a spreadsheet, fills, shapes and charts it, and reads it back', async ({
  page,
  pageErrors,
  baseURL,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  // The page's own guest, so the spreadsheet the agent makes opens here.
  await page.goto('/new?kind=spreadsheet');
  await expect(page.locator(READY)).toBeVisible();
  const headers = await pageOwnerHeaders(page);
  const api = createApiClient({
    baseUrl: `${baseURL}/api`,
    headers: () => headers,
    fetch: (r) => fetch(r),
  });

  const made = await createSpreadsheet(
    api,
    {
      name: 'Model values',
      sheets: [
        {
          name: 'Models',
          rows: [
            ['Model', 'Cost', 'Index', 'Pareto', 'Shown'],
            ['A', 1.5, 40, 40, true],
            ['B', 2, 50, '', false],
            ['C', 3, 55, '=IF(E4, C4, "")', true],
            ['D', 5, 61, 61, true],
          ],
        },
        { name: 'Notes', rows: [['Note', '="1/2"']] },
      ],
    },
    'mcp',
  );
  if (!made.ok) throw new Error(made.message);
  expect(made.sheets.map((s) => [s.name, s.filled])).toEqual([
    ['Models', 'A1:E5'],
    ['Notes', 'A1:B1'],
  ]);

  const changed = await changeSheet(
    api,
    made.documentId,
    {
      sheet: 'Models',
      changes: [
        { op: 'format', range: 'A1:E1', format: { bold: true } },
        { op: 'validate', range: 'E2:E5', rule: { type: 'checkbox' } },
        { op: 'freeze', rows: 1 },
        { op: 'filter', range: 'A1:E5' },
        { op: 'resize', cols: 'A:E', fit: true },
        {
          op: 'chart',
          type: 'scatter',
          range: 'B1:D5',
          at: 'G2',
          title: 'Value for money',
          xAxisTitle: 'Cost',
          yAxisTitle: 'Coding index',
          lines: ['Pareto'],
        },
      ],
    },
    'mcp',
  );
  expect(changed.refusal).toBeUndefined();
  const moved = await changeSheet(
    api,
    made.documentId,
    { sheet: 'Notes', changes: [{ op: 'move', after: null }] },
    'mcp',
  );
  expect(moved.refusal).toBeUndefined();

  // A third sheet through the workbook door, after Models, filled.
  const added = await addSheet(
    api,
    made.documentId,
    {
      title: 'Pareto',
      after: 'Models',
      rows: [
        ['Cost', 'Index'],
        [1.5, 40],
      ],
    },
    'mcp',
  );
  expect(added).toMatchObject({ ok: true, title: 'Pareto', filled: 'A1:B2' });

  const read = await readSheet(api, made.documentId, { sheet: 'Models', range: 'A1:E5' });
  if (!read.ok) throw new Error(read.message);
  const at = (a1: string) => read.cells.find((c) => c.at === a1);
  expect(at('B2')?.value).toBe(1.5);
  expect(at('D4')).toMatchObject({ input: '=IF(E4, C4, "")', value: 55 });
  expect(at('E3')?.value).toBe(false);
  expect(read.frozen.rows).toBe(1);
  expect(read.charts).toEqual([
    expect.objectContaining({
      type: 'scatter',
      range: 'B1:D5',
      at: 'G2',
      title: 'Value for money',
      axis: true,
      lines: ['Pareto'],
    }),
  ]);
  const notes = await readSheet(api, made.documentId, { sheet: 'Notes' });
  if (!notes.ok) throw new Error(notes.message);
  expect(notes.cells.map((c) => c.value)).toEqual(['Note', '1/2']);

  await page.goto(`/document/${made.documentId}`);
  await expect(page.locator(READY)).toBeVisible();
  // Notes was moved first, so it opens; the chart is on Models.
  await page.getByRole('tab', { name: 'Models' }).click();
  const chart = page.locator('[data-sheet-chart]');
  await expect(chart).toHaveAttribute('aria-label', 'Scatter chart: Value for money');
  await expect(chart.locator('[data-chart-title="title"]')).toHaveText('Value for money');
  await expect(chart.locator('[data-chart-title="y"]')).toHaveText('Coding index');
  await page.screenshot({
    path: test.info().outputPath('agent-chart.png'),
    animations: 'disabled',
  });
  expectNoPageErrors(pageErrors);
});
