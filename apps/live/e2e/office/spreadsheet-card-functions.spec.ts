import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';

// The card functions in a spreadsheet (plan 0020 Phase 14 box 2; docs/specs/029-sheets/plan-links.md "The `CARD`
// functions", D509): with no cards' document chosen they read #REF!; with one named in the settings they read its
// cards with the reader's own access and follow a new card; a document the reader may not open reads #REF! again.

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

const cell = (page: Page, name: string) =>
  page.getByRole('grid').getByRole('gridcell', { name, exact: true });

test('the card functions read the cards of the Plan document the settings name', async ({
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
  await typeInto(page, 'A1', '=CARDCOUNT()');
  await typeInto(page, 'B1', '=CARDCOUNT("State", "Done")');
  await expect(cell(page, 'A1 #REF!')).toHaveCount(1);

  // A Plan document holding two cards, one of them done.
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  const planId = `cards-${Date.now()}`;
  const created = await page.request.post(`${apiBase}/documents`, {
    headers,
    data: {
      id: planId,
      name: 'Roadmap',
      tabs: [{ id: `${planId}-t`, name: 'Board', elements: [] }],
      items: [
        { type: 'task', fields: { title: 'Sign up', status: 'done' } },
        { type: 'task', fields: { title: 'Log in', status: 'todo' } },
      ],
    },
  });
  expect(created.status()).toBeLessThan(300);

  // Cards From, saved with the settings: the cells read the cards.
  const read = await page.request.get(`${apiBase}/documents/${bookId}`, { headers });
  const { settings } = ((await read.json()) as { document: { workbook: { settings: object } } })
    .document.workbook;
  const saveCardsFrom = async (cardsDocument: string) => {
    const saved = await page.request.put(`${apiBase}/documents/${bookId}/workbook/settings`, {
      headers,
      data: { settings: { ...settings, cardsDocument } },
    });
    expect(saved.status()).toBe(200);
  };
  await saveCardsFrom(planId);
  await expect(cell(page, 'A1 2')).toHaveCount(1);
  await expect(cell(page, 'B1 1')).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath('card-functions.png'),
    animations: 'disabled',
  });

  // A new card reaches the cells within the refresh (10 s).
  const added = await page.request.post(`${apiBase}/documents/${planId}/items`, {
    headers,
    data: { type: 'task', fields: { title: 'Pay', status: 'done' } },
  });
  expect(added.status()).toBeLessThan(300);
  await expect(cell(page, 'A1 3')).toHaveCount(1, { timeout: 25_000 });
  await expect(cell(page, 'B1 2')).toHaveCount(1);

  // A document the reader may not open (or none at all) reads #REF!, never cards.
  await saveCardsFrom(`gone-${Date.now()}`);
  await expect(cell(page, 'A1 #REF!')).toHaveCount(1);

  expectNoPageErrors(pageErrors);
});
