import type { Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn } from './pdf-document-pages';

// One person's room for a PDF's pages (docs/specs/035-pdf-documents/reading-surface.md "Read mode", "Full screen";
// keyboard-shortcuts.md "Reading"; office-shell.md "Title row"): Read mode hides the menus, the toolbar and the
// panels and is left by Escape, its key or its button; Full screen shows one page a screen, turned by the arrows, and
// leaving brings back the view it found.

const PAGES = '[data-pdf-pages]';
const menuBar = (page: Page) => page.getByRole('menubar', { name: 'Menu bar' });
const rail = (page: Page) => page.getByRole('toolbar', { name: 'Panels' });
const thumbnails = (page: Page) => page.getByRole('complementary', { name: 'Thumbnails' });
const pageBar = (page: Page) => page.getByRole('group', { name: 'Page and zoom' });
const leave = (page: Page) => page.getByRole('button', { name: 'Leave read mode' });
const laidOut = (page: Page) => page.locator(`${PAGES} [data-pdf-page]`);
const fullScreenShown = (page: Page) => page.evaluate(() => document.fullscreenElement !== null);

async function viewItem(page: Page, item: string) {
  await menuBar(page).getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitemcheckbox', { name: item, exact: true }).click();
}

async function openPdf(page: Page) {
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Field guide.pdf', await textPdf(7));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);
}

test('Read mode hides the menus, toolbar and panels, and Escape, its key and its button leave it', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await openPdf(page);
  await rail(page).getByRole('button', { name: 'Thumbnails' }).click();
  await expect(thumbnails(page)).toBeVisible();

  // View > Read mode: the menu bar, the toolbar and the panels go; the name line and the page bar stay.
  await viewItem(page, 'Read mode');
  await expect(menuBar(page)).toBeHidden();
  await expect(page.getByRole('toolbar', { name: 'Toolbar' })).toBeHidden();
  await expect(rail(page)).toBeHidden();
  await expect(thumbnails(page)).toBeHidden();
  await expect(leave(page)).toBeVisible();
  await expect(pageBar(page)).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('pdf-read-mode-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-read-mode-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });

  // Escape on the pages leaves; the panel that was open is open again.
  await page.locator(PAGES).focus();
  await page.keyboard.press('Escape');
  await expect(menuBar(page)).toBeVisible();
  await expect(thumbnails(page)).toBeVisible();

  // ⌃⌥R enters it, and the one button leaves it.
  await page.locator(PAGES).focus();
  await page.keyboard.press('Control+Alt+KeyR');
  await expect(leave(page)).toBeVisible();
  await leave(page).click();
  await expect(menuBar(page)).toBeVisible();
  await expect(leave(page)).toBeHidden();
  expectNoPageErrors(pageErrors);
});

test('Full screen shows one page a screen, turned by the arrows, and leaving brings back the view', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await openPdf(page);
  // Continuous at Fit width: more than one page laid out.
  expect(await laidOut(page).count()).toBeGreaterThan(1);

  // View > Full screen: the pages column alone, one page at a time, no page bar.
  await viewItem(page, 'Full screen');
  await expect.poll(() => fullScreenShown(page)).toBe(true);
  await expect(laidOut(page)).toHaveCount(1);
  await expect(page.locator('[data-pdf-page="1"]')).toBeInViewport();
  await expect(pageBar(page)).toBeHidden();
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('pdf-full-screen-dark.png') });

  // → turns to the next page, ← back.
  await page.locator(PAGES).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-pdf-page="2"]')).toBeInViewport();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-pdf-page="1"]')).toBeInViewport();

  // ⌃⌥F leaves: Continuous again, the page bar back.
  await page.keyboard.press('Control+Alt+KeyF');
  await expect.poll(() => fullScreenShown(page)).toBe(false);
  await expect(pageBar(page)).toBeVisible();
  await expect.poll(() => laidOut(page).count()).toBeGreaterThan(1);
  expectNoPageErrors(pageErrors);
});
