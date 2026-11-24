import type { Page } from '@playwright/test';
import { DARK_PAGES_PARTS, darkPagesPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn } from './pdf-document-pages';

// Dark pages (docs/specs/035-pdf-documents/dark-pages.md "The recolouring", "The setting"; keyboard-shortcuts.md
// "Reading"): one person's view of the pages shown dark in the dark scheme, the photograph kept as drawn; turned on
// and off from View, the toolbar and its key; not offered in the light scheme, where the pages are as the file says.

const SURFACE = '[data-pdf-surface="ready"]';
const menuBar = (page: Page) => page.getByRole('menubar', { name: 'Menu bar' });
const question = (page: Page) => page.getByRole('region', { name: 'Show PDF pages dark?' });
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

test('Dark pages shows a PDF’s pages dark for one person, the photograph as drawn', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Dark pages.pdf', darkPagesPdf(), { asked: false });
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  // The toolbar's toggle is Viewing's.
  await page.getByRole('button', { name: /^Mode: / }).click();
  await page.getByRole('menuitemradio', { name: /Viewing/ }).click();

  // Off until answered: the pages are as the file says, and the question stands until it is.
  await expect(page.locator(SURFACE)).toHaveAttribute('data-pdf-look', 'paper');
  await expect(question(page)).toBeVisible();
  await expect.poll(() => colourAt(page, ...PAPER)).toEqual([255, 255, 255]);
  const photograph = await colourAt(page, ...PHOTOGRAPH);

  // View > Dark pages: the paper turns dark, the photograph stays as drawn.
  await menuBar(page).getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Dark pages' }).click();
  await expect(page.locator(SURFACE)).toHaveAttribute('data-pdf-look', 'dark');
  await expect(question(page)).toHaveCount(0);
  await expect.poll(() => colourAt(page, ...PAPER), { timeout: 15_000 }).toEqual([31, 31, 31]);
  expect(await colourAt(page, ...PHOTOGRAPH)).toEqual(photograph);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('pdf-dark-pages-on.png') });

  // ⌃⌥N turns it off, and the toolbar's toggle on again.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('Control+Alt+KeyN');
  await expect(page.locator(SURFACE)).toHaveAttribute('data-pdf-look', 'paper');
  await expect.poll(() => colourAt(page, ...PAPER), { timeout: 15_000 }).toEqual([255, 255, 255]);
  await toggle(page).click();
  await expect(page.locator(SURFACE)).toHaveAttribute('data-pdf-look', 'dark');

  // The light scheme: not offered, and the pages are as the file says whatever the setting.
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator(SURFACE)).toHaveAttribute('data-pdf-look', 'paper');
  await expect(toggle(page)).toHaveCount(0);
  await expect.poll(() => colourAt(page, ...PAPER), { timeout: 15_000 }).toEqual([255, 255, 255]);
  await page.screenshot({ path: test.info().outputPath('pdf-dark-pages-light.png') });
  expectNoPageErrors(pageErrors);
});

test('the first-time question asks once, without blocking reading, and its answer sets Dark pages', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Dark pages.pdf', darkPagesPdf(), { asked: false });
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  // A card, never a dialog: focus stays where it was, the pages still turn, and it shows the page both ways.
  await expect(question(page)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(question(page).locator('canvas')).toHaveCount(2);
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('2');
  await page.waitForTimeout(500);
  await page.screenshot({ path: test.info().outputPath('pdf-dark-pages-question.png') });
  // On a phone it spans the pages' width.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(question(page)).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: test.info().outputPath('pdf-dark-pages-question-phone.png') });
  await page.setViewportSize({ width: 1280, height: 860 });

  // F6 reaches it; its answer sets Dark pages, and it is never asked again.
  for (
    let at = 0;
    at < 8 && !(await question(page).evaluate((card) => card.contains(document.activeElement)));
    at += 1
  )
    await page.keyboard.press('F6');
  await question(page).getByRole('button', { name: 'Use dark pages' }).click();
  await expect(question(page)).toHaveCount(0);
  await expect(page.locator(SURFACE)).toHaveAttribute('data-pdf-look', 'dark');
  await page.reload();
  await pageOneDrawn(page);
  await expect(page.locator(SURFACE)).toHaveAttribute('data-pdf-look', 'dark');
  await expect(question(page)).toHaveCount(0);

  expectNoPageErrors(pageErrors);
});
