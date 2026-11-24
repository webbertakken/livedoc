import type { Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn } from './pdf-document-pages';

// The office shell filled for a PDF (docs/specs/035-pdf-documents/reading-surface.md "The title row", "Menus", "The
// toolbar"; editing-modes.md "Switching"): the pill names the file, the menu bar holds the menus the mode's level
// reaches, an item not built is drawn dimmed, and the toolbar is the mode's own, in the dark and the light scheme.

const menuBar = (page: Page) => page.getByRole('menubar', { name: 'Menu bar' });
const menuNames = (page: Page) => menuBar(page).getByRole('menuitem').allTextContents();
const toolbar = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
/** The open menu once its fade has ended, so a capture shows it whole. */
const menuShown = (page: Page) =>
  page
    .getByRole('menu')
    .last()
    .evaluate((menu) => Promise.all(menu.getAnimations().map((fade) => fade.finished)));

test('a PDF’s title row, menus and toolbar are its own, and follow the editing mode', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Lease agreement.pdf', await textPdf(2));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  // "The title row": the pill reads PDF, its tooltip the file's own version, its pages and its size.
  await expect(page.getByLabel(/^PDF \d\.\d, 2 pages, \d+ kB$/)).toHaveText('PDF');

  // An Editor starts in Reviewing: the menus a Participant has. Pages is Editing's alone, so it is not drawn.
  await expect(page.getByRole('button', { name: 'Mode: Reviewing' })).toBeVisible();
  expect(await menuNames(page)).toEqual([
    'File',
    'Edit',
    'View',
    'Insert',
    'Format',
    'Tools',
    'Help',
  ]);

  // "Menus": what is built runs, what is not is drawn dimmed, "Coming soon". Insert opens by its access key.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('Alt+I');
  const highlight = page.getByRole('menuitemradio', { name: 'Highlight', exact: true });
  await expect(highlight).toBeVisible();
  await expect(highlight).not.toHaveAttribute('aria-disabled', 'true');
  const underline = page.getByRole('menuitemradio', { name: 'Underline', exact: true });
  await expect(underline).toHaveAttribute('aria-disabled', 'true');
  await expect(underline).toHaveAccessibleDescription('Coming soon');
  // An `edit` item is Editing's: not in Reviewing's menus.
  await expect(page.getByRole('menuitem', { name: 'Text box', exact: true })).toHaveCount(0);
  await menuShown(page);
  await page.screenshot({ path: test.info().outputPath('pdf-shell-insert-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-shell-insert-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.keyboard.press('Escape');

  // "The toolbar": every mode's groups, then Reviewing's own.
  await expect(toolbar(page, 'Highlight')).toHaveAttribute('aria-pressed', 'false');
  await expect(toolbar(page, 'Comment')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: /^Page display/ })).toHaveCount(0);

  // Viewing: a Viewer's menus, and the reading tools in place of the marking ones, on a bar of the same height.
  const barTop = (await page.locator('[data-pdf-pages]').boundingBox())!.y;
  await page.getByRole('button', { name: 'Mode: Reviewing' }).click();
  await page.getByRole('menuitemradio', { name: /Viewing/ }).click();
  await expect(page.getByRole('button', { name: 'Mode: Viewing' })).toBeVisible();
  expect(await menuNames(page)).toEqual(['File', 'Edit', 'View', 'Tools', 'Help']);
  await expect(toolbar(page, 'Highlight')).toHaveCount(0);
  await expect(toolbar(page, 'Undo')).toHaveCount(0);
  await expect(toolbar(page, 'Page display: Continuous')).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
  // dark-pages.md "The setting": in the dark scheme the toolbar's Dark pages toggle runs, off until answered.
  await expect(toolbar(page, 'Dark pages')).toHaveAttribute('aria-pressed', 'false');
  await expect(toolbar(page, 'Select')).toHaveAttribute('aria-pressed', 'true');
  // "The toolbar never changes height between modes, so the pages do not jump."
  expect((await page.locator('[data-pdf-pages]').boundingBox())!.y).toBe(barTop);

  // View lists the whole of reading, in both schemes.
  await menuBar(page).getByRole('menuitem', { name: 'View' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Dark pages' })).toBeVisible();
  await menuShown(page);
  await page.screenshot({ path: test.info().outputPath('pdf-shell-view-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-shell-view-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.keyboard.press('Escape');

  expectNoPageErrors(pageErrors);
});
