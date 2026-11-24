import type { Page } from '@playwright/test';
import { DARK_PAGES_PARTS, darkPagesPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn } from './pdf-document-pages';

// Dark pages (docs/specs/035-pdf-documents/dark-pages.md "The recolouring", "The setting"; keyboard-shortcuts.md
// "Reading"): a PDF's pages follow the scheme, dark in the dark one with the photograph kept as drawn, paper in the
// light one; one person may turn it off and on from View, the toolbar and its key; nothing is asked.

const SURFACE = '[data-pdf-surface="ready"]';
const menuBar = (page: Page) => page.getByRole('menubar', { name: 'Menu bar' });
const toggle = (page: Page) =>
  page.getByRole('toolbar', { name: 'Toolbar' }).getByRole('button', { name: 'Dark pages' });

/** Page one's picture at a point of the page, in its points. */
const colourAt = (page: Page, x: number, y: number) =>
  page
    .locator('[data-pdf-page="1"] canvas')
    .first()
    .evaluate(
      (canvas: HTMLCanvasElement, at) => {
        const px = Math.round((at.x / 612) * canvas.width);
        const py = Math.round(((792 - at.y) / 792) * canvas.height);
        return [...canvas.getContext('2d')!.getImageData(px, py, 1, 1).data.slice(0, 3)];
      },
      { x, y },
    );
const PAPER: [number, number] = [500, 100];
const PHOTOGRAPH: [number, number] = [
  DARK_PAGES_PARTS.photograph[0] + 100,
  DARK_PAGES_PARTS.photograph[1] + 100,
];

test('a PDF’s pages follow the scheme, the photograph as drawn, and one person may turn it off', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Dark pages.pdf', darkPagesPdf(), { asTheFileSays: false });
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  // The toolbar's toggle is Viewing's.
  await page.getByRole('button', { name: /^Mode: / }).click();
  await page.getByRole('menuitemradio', { name: /Viewing/ }).click();

  // Dark at once in the dark scheme, nothing asked: the paper dark, the photograph as drawn.
  await expect(page.locator(SURFACE)).toHaveAttribute('data-pdf-look', 'dark');
  await expect(page.getByRole('region', { name: 'Show PDF pages dark?' })).toHaveCount(0);
  await expect.poll(() => colourAt(page, ...PAPER), { timeout: 15_000 }).toEqual([31, 31, 31]);
  const photograph = await colourAt(page, ...PHOTOGRAPH);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('pdf-dark-pages-on.png') });

  // View > Dark pages turns it off: the pages as the file says, the photograph the same as before.
  await menuBar(page).getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Dark pages' }).click();
  await expect(page.locator(SURFACE)).toHaveAttribute('data-pdf-look', 'paper');
  await expect.poll(() => colourAt(page, ...PAPER), { timeout: 15_000 }).toEqual([255, 255, 255]);
  expect(await colourAt(page, ...PHOTOGRAPH)).toEqual(photograph);

  // ⌃⌥N turns it on, the toolbar's toggle off, and its key on again; the choice survives a reload.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('Control+Alt+KeyN');
  await expect(page.locator(SURFACE)).toHaveAttribute('data-pdf-look', 'dark');
  await toggle(page).click();
  await expect(page.locator(SURFACE)).toHaveAttribute('data-pdf-look', 'paper');
  await page.reload();
  await pageOneDrawn(page);
  await expect(page.locator(SURFACE)).toHaveAttribute('data-pdf-look', 'paper');
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('Control+Alt+KeyN');
  await expect(page.locator(SURFACE)).toHaveAttribute('data-pdf-look', 'dark');

  // The light scheme: not offered, and the pages are as the file says whatever the setting.
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator(SURFACE)).toHaveAttribute('data-pdf-look', 'paper');
  await expect(toggle(page)).toHaveCount(0);
  await expect.poll(() => colourAt(page, ...PAPER), { timeout: 15_000 }).toEqual([255, 255, 255]);
  await page.screenshot({ path: test.info().outputPath('pdf-dark-pages-light.png') });
  expectNoPageErrors(pageErrors);
});
