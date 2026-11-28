import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Print and Print preview (docs/specs/034-text-documents/files-and-print.md "Printing"): the preview shows the pages
// in their printing look (a pending suggestion drawn accepted, light paper, read only) under its own bar; Print hands
// the browser the written PDF in a frame of its own, from File > Print, ⌘P and the preview's Print alike.

const BODY = '[role="textbox"][aria-label="Document body"]';
const PREVIEW_BAR = '[data-print-preview-bar]';

test('Print preview shows the pages as printed, and Close brings the editor back', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('The fox jumps.');
  // A pending suggestion: an insertion typed while suggesting.
  await page.keyboard.press('Control+Alt+Shift+KeyX');
  await expect(page.getByRole('button', { name: 'Mode: Suggesting' })).toBeVisible();
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.type('quick ');
  await expect(body.locator('.text-document-insertion')).toHaveText('quick ');

  await (await officeMenuItem(page, ['File', 'Print preview'])).click();
  const bar = page.locator(PREVIEW_BAR);
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Print' })).toBeFocused();
  // The menus and the toolbar make way for the bar.
  await expect(page.getByRole('menubar')).toHaveCount(0);
  // The suggestion drawn accepted: the words read as they would, with no suggestion's colour.
  await expect(page.locator('[data-printing="preview"]')).toHaveCount(1);
  await expect(body).toContainText('The quick fox jumps.');
  await expect(body.locator('.text-document-insertion')).toHaveCount(0);
  // Light paper whatever the scheme.
  expect(
    await page
      .locator('[data-printing="preview"]')
      .evaluate((element) => getComputedStyle(element).colorScheme),
  ).toBe('light');
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('print-preview.png') });

  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect(page.getByRole('menubar')).toBeVisible();
  await expect(page.locator('[data-printing]')).toHaveCount(0);
  await expect(body.locator('.text-document-insertion')).toHaveText('quick ');
  expectNoPageErrors(pageErrors);
});

test('Print hands the browser the written pages, from the menu, ⌘P and the preview', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  // Each print handed to the browser, as the page logs it: a headless browser prints at once, its frame gone at once.
  const prints: string[] = [];
  page.on('console', (message) => {
    if (message.text().startsWith('[text-document] printed')) prints.push(message.text());
  });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await page.locator(BODY).click();
  await page.keyboard.type('Printed words');

  const printed = async (start: () => Promise<void>) => {
    const before = prints.length;
    await start();
    await expect.poll(() => prints.length, { timeout: 30_000 }).toBe(before + 1);
    expect(prints.at(-1)).toMatch(/outcome: (printed|unconfirmed)/);
    await expect(page.getByRole('dialog', { name: 'Making the print' })).toHaveCount(0);
  };
  await printed(async () => (await officeMenuItem(page, ['File', 'Print'])).click());
  // The print handed over, the focus is back in the writing: ⌘P prints again.
  await expect(page.locator(BODY)).toBeFocused();
  await printed(() => page.keyboard.press('Control+p'));
  await (await officeMenuItem(page, ['File', 'Print preview'])).click();
  await printed(() => page.locator(PREVIEW_BAR).getByRole('button', { name: 'Print' }).click());
  // Printing from the preview leaves it open.
  await expect(page.locator(PREVIEW_BAR)).toBeVisible();
  await expect(page.locator('[data-printing="preview"]')).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});
