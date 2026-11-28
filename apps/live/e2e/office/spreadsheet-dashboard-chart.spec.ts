import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';

// A Dashboard's Sheet Chart from a spreadsheet (plan 0020 Phase 14 box 1; docs/specs/029-sheets/plan-links.md "The
// Sheet Chart from a spreadsheet", D508): an Editor picks a spreadsheet's sheet in Choose a Chart and makes a new chart
// over a range; the slot draws it from the spreadsheet's cells and follows a change made there.

test.use({ colorScheme: 'dark', launchOptions: { args: ['--mute-audio'] } });

const READY = '[data-spreadsheet-surface="ready"]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

async function typeInto(page: Page, cell: string, input: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(cell);
  await nameBox.press('Enter');
  await page.keyboard.type(input);
  await page.keyboard.press('Enter');
}

type LinkRead = {
  name: string;
  sheets: { id: string; title: string }[];
  sheet: { layout: { rows: string[]; cols: string[] } } | null;
};

test('a Sheet Chart reads a spreadsheet’s cells and follows them', async ({
  page,
  baseURL,
  pageErrors,
}, testInfo) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });

  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const bookId = new URL(page.url()).pathname.split('/')[2]!;
  await typeInto(page, 'A1', 'Rent');
  await typeInto(page, 'B1', '1200');
  await typeInto(page, 'A2', 'Food');
  await typeInto(page, 'B2', '300');

  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  const linkOf = async (sheet = '') => {
    const res = await page.request.get(
      `${apiBase}/documents/${bookId}/workbook/link${sheet ? `?sheet=${sheet}` : ''}`,
      { headers },
    );
    expect(res.status()).toBe(200);
    return (await res.json()) as LinkRead;
  };
  const sheetId = (await linkOf()).sheets[0]!.id;
  await expect
    .poll(async () => (await linkOf(sheetId)).sheet?.layout.rows.length ?? 0)
    .toBeGreaterThan(1);

  // A Plan document whose Dashboard has one empty slot.
  const planId = `dash-${Date.now()}`;
  const created = await page.request.post(`${apiBase}/documents`, {
    headers,
    data: {
      id: planId,
      name: 'Household',
      tabs: [
        {
          id: `${planId}-t`,
          name: 'Overview',
          kind: 'dashboard',
          opensIn: 'plan',
          elements: [],
          dashboard: { rows: [{ id: 'row1', height: 380, slots: [{ id: 'slot1', span: 12 }] }] },
        },
      ],
    },
  });
  expect(created.status()).toBeLessThan(300);
  await page.goto(`/document/${planId}`);

  // Add to Slot, From a Sheet, Sheet Chart: the spreadsheet's sheet, then a new column chart over A1:B2.
  await page.getByRole('button', { name: 'Add to Slot' }).click();
  await page.getByRole('button', { name: /^From a Sheet/ }).click();
  await page.getByRole('button', { name: 'Add Sheet Chart' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a Chart' });
  const spreadsheets = picker.getByRole('region', { name: 'Spreadsheets' });
  await spreadsheets
    .getByRole('list', { name: 'Your spreadsheets' })
    .getByRole('button')
    .first()
    .click();
  await spreadsheets.getByRole('button', { name: /^Sheet1 · / }).click();
  await expect(picker.getByText('No charts yet')).toBeVisible();
  await picker.getByRole('textbox', { name: 'Range' }).fill('A1:B2');
  await picker.getByRole('button', { name: 'Add Chart' }).click();
  await expect(picker).toBeHidden();

  const chart = page.getByRole('group', { name: 'Column chart' });
  await expect(chart).toBeVisible();
  await expect(chart).toContainText('Rent');
  await page.screenshot({ path: testInfo.outputPath('sheet-chart.png'), animations: 'disabled' });

  // A change in the spreadsheet reaches the chart within the link's refresh (10 s).
  const { layout } = (await linkOf(sheetId)).sheet!;
  const write = await page.request.post(`${apiBase}/documents/${bookId}/sheets/${sheetId}/writes`, {
    headers,
    data: {
      write: {
        kind: 'cells',
        cells: [{ r: layout.rows[0], c: layout.cols[0], i: { s: 'Housing' } }],
      },
    },
  });
  expect(write.status()).toBe(200);
  await expect(chart).toContainText('Housing', { timeout: 25_000 });

  expectNoPageErrors(pageErrors);
});
