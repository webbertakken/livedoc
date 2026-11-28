import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';

// A Dashboard's Spreadsheet slot (plan 0020 Phase 14 box 1; docs/specs/029-sheets/plan-links.md "The Spreadsheet
// slot", D507): an Editor chooses one of their spreadsheets, the slot shows its first sheet read-only with Open, and
// follows a change made in it within the link's refresh.

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

test('a Spreadsheet slot shows a spreadsheet’s first sheet, opens it and follows it', async ({
  page,
  baseURL,
  pageErrors,
}, testInfo) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });

  // A spreadsheet with a few cells.
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
  const bookName = (await linkOf()).name;

  // A Plan document whose Dashboard has a Spreadsheet slot with none chosen yet.
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
                height: 360,
                slots: [
                  { id: 'slot1', span: 12, content: { type: 'spreadsheet', documentId: '' } },
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

  // Choose a Spreadsheet: the person's newest spreadsheet is the one just made.
  await page.getByRole('button', { name: 'Choose a Spreadsheet' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a Spreadsheet' });
  await picker.getByRole('list', { name: 'Your spreadsheets' }).getByRole('button').first().click();
  await expect(picker).toBeHidden();

  // Its first sheet, read-only, under its name.
  const label = `Sheet1 · ${bookName}`;
  await expect(page.getByRole('heading', { name: label })).toBeVisible();
  const picture = page.getByRole('img', { name: label });
  await expect(picture).toBeVisible();
  await expect
    .poll(async () => decodeURIComponent((await picture.getAttribute('src')) ?? ''))
    .toContain('Rent');
  await page.screenshot({
    path: testInfo.outputPath('spreadsheet-slot.png'),
    animations: 'disabled',
  });

  // Open goes to the spreadsheet, in a new browser tab.
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Open', exact: true }).click(),
  ]);
  await expect.poll(() => popup.url()).toContain(`/document/${bookId}`);
  await popup.close();

  // A change in the spreadsheet reaches the slot within the link's refresh (10 s).
  const { layout } = (await linkOf(sheetId)).sheet!;
  const write = await page.request.post(`${apiBase}/documents/${bookId}/sheets/${sheetId}/writes`, {
    headers,
    data: {
      write: {
        kind: 'cells',
        cells: [{ r: layout.rows[0], c: layout.cols[0], i: { s: 'Rent paid' } }],
      },
    },
  });
  expect(write.status()).toBe(200);
  await expect
    .poll(async () => decodeURIComponent((await picture.getAttribute('src')) ?? ''), {
      timeout: 25_000,
    })
    .toContain('Rent paid');

  expectNoPageErrors(pageErrors);
});
