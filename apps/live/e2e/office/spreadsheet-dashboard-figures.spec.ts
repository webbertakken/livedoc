import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';

// A dashboard's figure read from a spreadsheet (plan 0020 Phase 14 box 1; docs/specs/029-sheets/plan-links.md
// "Reading a sheet from another document", "Dashboards", D505): an Editor picks the spreadsheet and its sheet in the
// figure's source picker, then a labelled number; the figure shows the spreadsheet's value and follows a change made
// in it within the link's refresh.

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
  sheets: { id: string; title: string }[];
  sheet: { layout: { rows: string[]; cols: string[] } } | null;
};

test('a dashboard figure reads a spreadsheet’s cell and follows it', async ({
  page,
  baseURL,
  pageErrors,
}, testInfo) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });

  // A spreadsheet: Rent 1200, Food 300, Total =SUM(B1:B2).
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const bookId = new URL(page.url()).pathname.split('/')[2]!;
  await typeInto(page, 'A1', 'Rent');
  await typeInto(page, 'B1', '1200');
  await typeInto(page, 'A2', 'Food');
  await typeInto(page, 'B2', '300');
  await typeInto(page, 'A3', 'Total');
  await typeInto(page, 'B3', '=SUM(B1:B2)');

  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  const linkOf = async (sheet = '') => {
    const res = await page.request.get(
      `${apiBase}/documents/${bookId}/workbook/link${sheet ? `?sheet=${sheet}` : ''}`,
      { headers },
    );
    expect(res.status()).toBe(200);
    return (await res.json()) as LinkRead;
  };
  // The cells land through the sheet's writes: wait until the room holds the total.
  const sheetId = (await linkOf()).sheets[0]!.id;
  await expect
    .poll(async () => (await linkOf(sheetId)).sheet?.layout.rows.length ?? 0)
    .toBeGreaterThan(2);

  // A Plan document whose Dashboard has one figure not set up yet.
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
          dashboard: {
            rows: [
              {
                id: 'row1',
                height: 220,
                slots: [
                  {
                    id: 'slot1',
                    span: 6,
                    content: { type: 'sheet-metric', metric: 'figure', sheetId: '' },
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  });
  expect(created.status()).toBeLessThan(300);
  await page.goto(`/document/${planId}`);

  // The figure's source: the person's spreadsheet, its sheet, then its labelled total.
  await page.getByRole('button', { name: 'Choose a Sheet' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a Sheet' });
  const spreadsheets = picker.getByRole('region', { name: 'Spreadsheets' });
  // The person's newest spreadsheet is the one just made.
  await spreadsheets
    .getByRole('list', { name: 'Your spreadsheets' })
    .getByRole('button')
    .first()
    .click();
  await spreadsheets.getByRole('button', { name: /^Sheet1 · / }).click();
  await picker.getByRole('button', { name: /^Total/ }).click();
  await page.screenshot({ path: testInfo.outputPath('figure-source.png'), animations: 'disabled' });
  await picker.getByRole('button', { name: 'Done' }).click();

  const figure = page.getByRole('group', { name: /^Total: 1500/ });
  await expect(figure).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('figure.png'), animations: 'disabled' });

  // A change in the spreadsheet reaches the figure within the link's refresh (10 s).
  const { layout } = (await linkOf(sheetId)).sheet!;
  const write = await page.request.post(`${apiBase}/documents/${bookId}/sheets/${sheetId}/writes`, {
    headers,
    data: {
      write: { kind: 'cells', cells: [{ r: layout.rows[0], c: layout.cols[1], i: { n: 1700 } }] },
    },
  });
  expect(write.status()).toBe(200);
  await expect(page.getByRole('group', { name: /^Total: 2000/ })).toBeVisible({ timeout: 25_000 });

  expectNoPageErrors(pageErrors);
});
