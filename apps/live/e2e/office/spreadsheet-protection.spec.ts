import type { Browser, Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Protected sheets and ranges (plan 0020 Phase 10 box 3; docs/specs/029-sheets/data-tools.md "Protected ranges"): the
// owner protects a range for Editors Only from Data › Protect Sheets and Ranges; a Participant sees it hatched and is
// refused there, never elsewhere; a warning range asks once, then lets them on; Protect Sheet on a tab opens the panel
// on that sheet.

const READY = '[data-spreadsheet-surface="ready"]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Name box' });
const cell = (page: Page, name: string) =>
  page.getByRole('grid').getByRole('gridcell', { name, exact: true });

async function select(page: Page, ref: string) {
  await nameBox(page).fill(ref);
  await nameBox(page).press('Enter');
}

async function typeIn(page: Page, ref: string, text: string) {
  await select(page, ref);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

async function participantOn(page: Page, browser: Browser, baseURL: string): Promise<Page> {
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL).origin });
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'participate' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;
  const ctx = await browser.newContext({
    baseURL,
    colorScheme: 'dark',
    viewport: { width: 1280, height: 860 },
  });
  const peer = await ctx.newPage();
  await peer.goto(`/document/shared?s=${code}`);
  const join = peer.getByRole('button', { name: /^join$/i });
  await expect(join.or(peer.locator(READY))).toBeVisible({ timeout: 30_000 });
  if (await join.isVisible()) await join.click();
  await expect(peer.locator(READY)).toBeVisible();
  return peer;
}

test('a range protected for Editors refuses a Participant, a warning range asks once', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await typeIn(page, 'A1', '1');

  // The owner protects A1:B3 for Editors Only, then C1:C3 with a warning.
  await select(page, 'A1:B3');
  await (await officeMenuItem(page, ['Data', 'Protect Sheets and Ranges'])).click();
  const panel = page.getByRole('complementary', { name: 'Protected Sheets and Ranges' });
  await expect(panel.getByRole('textbox', { name: 'Range' })).toHaveValue('A1:B3');
  await panel.getByRole('textbox', { name: 'Description' }).fill('Totals');
  await expect(panel.getByRole('radio', { name: 'Editors Only' })).toBeChecked();
  await page.screenshot({ path: test.info().outputPath('protection-form.png') });
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Go To Totals' })).toContainText('Editors');
  await panel.getByRole('button', { name: 'Add a Sheet or Range' }).click();
  await panel.getByRole('textbox', { name: 'Range' }).fill('C1:C3');
  await panel.getByRole('radio', { name: 'Show a Warning When Editing This Range' }).check();
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Go To C1:C3' })).toContainText('Warning');
  await page.screenshot({ path: test.info().outputPath('protection-list.png') });

  // A Participant sees both hatched, is refused inside Totals, and writes outside it.
  const peer = await participantOn(page, browser, baseURL!);
  await expect(peer.locator('[data-sheet-protected] > span')).toHaveCount(2);
  await peer.screenshot({ path: test.info().outputPath('protection-hatched.png') });
  await typeIn(peer, 'A2', '9');
  await expect(
    peer.getByText('This range is protected: only Editors can change it.').first(),
  ).toBeVisible();
  await expect(cell(peer, 'A2 9')).toHaveCount(0);
  await typeIn(peer, 'E5', '5');
  await expect(cell(peer, 'E5 5')).toHaveCount(1);
  await expect(cell(page, 'E5 5')).toHaveCount(1, { timeout: 15_000 });

  // The warning range asks once: Cancel leaves it, OK writes, the next change there asks no more.
  await typeIn(peer, 'C1', '7');
  const warning = peer.getByRole('dialog', { name: 'Protected range' });
  await expect(warning).toBeVisible();
  await peer.screenshot({ path: test.info().outputPath('protection-warning.png') });
  await warning.getByRole('button', { name: 'Cancel' }).click();
  await expect(cell(peer, 'C1 7')).toHaveCount(0);
  await typeIn(peer, 'C1', '7');
  await peer
    .getByRole('dialog', { name: 'Protected range' })
    .getByRole('button', { name: 'OK' })
    .click();
  await expect(cell(peer, 'C1 7')).toHaveCount(1);
  await typeIn(peer, 'C2', '8');
  await expect(peer.getByRole('dialog', { name: 'Protected range' })).toHaveCount(0);
  await expect(cell(peer, 'C2 8')).toHaveCount(1);
  await expect(cell(page, 'C2 8')).toHaveCount(1, { timeout: 15_000 });
  expectNoPageErrors(pageErrors);
});

test('Protect Sheet on a tab opens the panel on that sheet, and CELL reads it', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await typeIn(page, 'B1', '=CELL("protect", A1)');
  await expect(cell(page, 'B1 0')).toHaveCount(1);
  const tab = page.getByRole('tablist', { name: 'Sheets' }).getByRole('tab', { name: 'Sheet1' });
  await tab.click({ button: 'right' });
  await page
    .getByRole('dialog', { name: 'Sheet1 menu' })
    .getByRole('button', { name: 'Protect Sheet' })
    .click();
  const panel = page.getByRole('complementary', { name: 'Protected Sheets and Ranges' });
  await expect(panel.getByRole('radio', { name: 'Sheet', exact: true })).toBeChecked();
  await panel.getByRole('checkbox', { name: 'Except Certain Cells' }).check();
  await panel.getByRole('textbox', { name: 'Exception 1' }).fill('B1:B9');
  await panel.getByRole('radio', { name: 'Only the Owner' }).check();
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Go To Sheet1' })).toContainText('Owner');
  await expect(cell(page, 'B1 1')).toHaveCount(1);
  // The owner still writes there.
  await typeIn(page, 'A1', '3');
  await expect(cell(page, 'A1 3')).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});
