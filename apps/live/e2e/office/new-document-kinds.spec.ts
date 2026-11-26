import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test, untilHydrated } from '../fixtures';
import { NEW_EDITOR } from '../new-document-open';
import { pageOneDrawn } from './pdf-document-pages';

// The three document kinds in New Document (docs/specs/013-workspace/new-document-menu.md "The blanks";
// docs/specs/007-editor/new-document-route.md "Choosing a mode"; docs/specs/035-pdf-documents/starting-and-finding.md
// "Starting one"): the Explorer's menu makes a text document and a spreadsheet at once, and a Blank PDF once stored;
// Page, Sheet and Slides are gone; the /new wizard's seven cards make each kind too.

test.use({ colorScheme: 'dark' });

const SHOTS = process.env.E2E_SHOTS_DIR;
const TEXT_READY = '[data-text-document-surface="ready"]';

// The Explorer, its New Document button hydrated. The standby the face makes ready follows the last blank, which here
// becomes a kind, so the canvas is not waited for.
async function openExplorer(page: Page): Promise<void> {
  await page.goto('/explorer/home');
  await untilHydrated(page.getByRole('button', { name: 'More new document choices' }));
}

test('the menu makes a text document, a spreadsheet and a Blank PDF, and offers no Page, Sheet or Slides', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openExplorer(page);
  const more = page.getByRole('button', { name: 'More new document choices' });
  await more.click();
  for (const gone of ['Page', 'Sheet', 'Slides'])
    await expect(page.getByRole('menuitem', { name: `${gone}, blank`, exact: true })).toHaveCount(
      0,
    );
  const pdfRow = page.getByRole('menuitem', { name: 'PDF document, blank' });
  await expect(pdfRow).toHaveAttribute('aria-keyshortcuts', '6');
  await pdfRow.hover();
  await expect(page.getByRole('menuitem', { name: 'Open a PDF file' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/menu-pdf.png` });
  await page.getByRole('menuitem', { name: 'Text document, blank' }).click();
  await expect(page).toHaveURL(NEW_EDITOR);
  await expect(page.locator(TEXT_READY)).toBeVisible({ timeout: 30_000 });

  await openExplorer(page);
  await more.click();
  await page.getByRole('menuitem', { name: 'Spreadsheet, blank' }).click();
  await expect(page).toHaveURL(NEW_EDITOR);
  await expect(page.locator('[data-spreadsheet-surface="ready"]')).toBeVisible({ timeout: 30_000 });

  await openExplorer(page);
  await more.click();
  await page.getByRole('menuitem', { name: 'PDF document, blank' }).click();
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);
  expectNoPageErrors(pageErrors);
});

test('the /new wizard offers seven cards, and its kinds make their documents', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new');
  const cards = page.locator('[data-new-mode]');
  await expect(cards).toHaveCount(7);
  await expect(page.locator('[data-new-mode="pages"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open a PDF file' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/new-desktop.png` });
  await page.locator('[data-new-mode="text-document"]').click();
  await expect(page.locator(TEXT_READY)).toBeVisible({ timeout: 30_000 });

  await page.goto('/new');
  await page.locator('[data-new-mode="pdf-document"]').click();
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);
  expectNoPageErrors(pageErrors);
});

test('the /new wizard’s seven cards stack on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/new');
  await expect(page.locator('[data-new-mode]')).toHaveCount(7);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/new-phone.png`, fullPage: true });
});
