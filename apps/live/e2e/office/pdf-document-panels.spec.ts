import type { Page } from '@playwright/test';
import {
  embeddedFilesPdf,
  embeddedPdfPdf,
  labelledPdf,
  layeredDrawingPdf,
  outlinePdf,
  textPdf,
} from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn } from './pdf-document-pages';

// The left panel of a PDF (docs/specs/035-pdf-documents/reading-surface.md "The left panel", "Thumbnails", "Go to
// page"; keyboard-shortcuts.md "Panels"): the rail, Thumbnails drawn by the engine and pressed to go, the page in view
// outlined, the panel remembered, and a page label typed in the page bar, in the dark and the light scheme.

const pageBar = (page: Page) => page.getByRole('group', { name: 'Page and zoom' });
const pageField = (page: Page) => pageBar(page).getByRole('textbox', { name: 'Page' });
const rail = (page: Page) => page.getByRole('toolbar', { name: 'Panels' });
const thumbnails = (page: Page) => page.getByRole('complementary', { name: 'Thumbnails' });

async function openPdf(page: Page, name: string, bytes: Uint8Array) {
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, name, bytes);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);
}

test('a PDF’s thumbnails go to their pages, and the page bar takes a page’s label', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await openPdf(page, 'Field guide.pdf', await textPdf(7));

  // "The rail": a toolbar of toggles; Thumbnails opens its panel, every page drawn small by the engine.
  const button = rail(page).getByRole('button', { name: 'Thumbnails' });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(thumbnails(page).getByRole('button', { name: /^Page \d$/ })).toHaveCount(7);
  await expect(
    thumbnails(page).locator('[data-pdf-thumbnail="1"][data-pdf-thumbnail-drawn="true"]'),
  ).toBeAttached({ timeout: 15_000 });
  await expect(thumbnails(page).getByRole('button', { name: 'Page 1' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('pdf-thumbnails-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-thumbnails-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });

  // "A press goes to the page"; the page in view's thumbnail is the current one.
  await thumbnails(page).getByRole('button', { name: 'Page 5' }).click();
  await expect(pageField(page)).toHaveValue('5');
  await expect(page.locator('[data-pdf-page="5"]')).toBeInViewport();
  await expect(thumbnails(page).getByRole('button', { name: 'Page 5' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // "Keys": Down and Up between thumbnails, Enter goes.
  await thumbnails(page).getByRole('button', { name: 'Page 5' }).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(pageField(page)).toHaveValue('6');

  // Escape closes the panel and gives the pages the keys; ⌘⌥⇧T opens it again, focus on the page in view.
  await page.keyboard.press('Escape');
  await expect(thumbnails(page)).toHaveCount(0);
  await expect(page.locator('[data-pdf-pages]')).toBeFocused();
  await page.keyboard.press('Control+Alt+Shift+T');
  await expect(thumbnails(page).getByRole('button', { name: 'Page 6' })).toBeFocused();

  // "Which panel is open is remembered": the next PDF opens with Thumbnails, its pages labelled.
  await openPdf(page, 'Labelled.pdf', labelledPdf());
  await expect(thumbnails(page)).toBeVisible();
  await expect(
    thumbnails(page)
      .locator('[data-pdf-thumbnail]')
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label'))),
  ).resolves.toEqual(['Page 1, i', 'Page 2, ii', 'Page 3, A-1']);

  // "Go to page": a label typed in the page bar goes to its page; one that names none says so.
  await pageField(page).fill('A-1');
  await pageField(page).press('Enter');
  await expect(pageField(page)).toHaveValue('3');
  await pageField(page).fill('ii');
  await pageField(page).press('Enter');
  await expect(pageField(page)).toHaveValue('2');
  await pageField(page).fill('iv');
  await pageField(page).press('Enter');
  await expect(pageBar(page).locator('..').getByRole('status')).toHaveText('There is no page iv.');
  await page.screenshot({ path: test.info().outputPath('pdf-go-to-label-dark.png') });

  // "Outline": the bookmarks as a tree; a press goes to a place, asks before an address, says what it never does.
  await openPdf(page, 'Bookmarked.pdf', outlinePdf());
  await rail(page).getByRole('button', { name: 'Outline' }).click();
  const tree = page.getByRole('tree', { name: 'Bookmarks' });
  await expect(tree.getByRole('treeitem')).toHaveText([
    'Chapter 1',
    'Website',
    'Run it',
    'Elsewhere',
  ]);
  await tree.getByRole('treeitem', { name: 'Chapter 1' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(tree.getByRole('treeitem', { name: 'Section 1.1' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(pageField(page)).toHaveValue('2');
  await expect(tree.getByRole('treeitem', { name: 'Section 1.1' })).toHaveAttribute(
    'aria-current',
    'location',
  );
  await page.screenshot({ path: test.info().outputPath('pdf-outline-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-outline-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await tree.getByRole('treeitem', { name: 'Website' }).click();
  const link = page.getByRole('dialog', { name: 'Link' });
  await expect(link).toContainText('Open this address?');
  await expect(link).toContainText('https://example.com/a');
  await page.screenshot({ path: test.info().outputPath('pdf-link-ask-dark.png') });
  await link.getByRole('button', { name: 'Cancel' }).click();
  await tree.getByRole('treeitem', { name: 'Run it' }).click();
  await expect(link).toContainText('This link asks for something LiveDoc never does.');
  await link.getByRole('button', { name: 'Close' }).click();
  await expect(link).toHaveCount(0);

  // "Embedded files": listed as the PDF says, a warning before saving a file that runs, saved on Save.
  await openPdf(page, 'Carrying.pdf', embeddedFilesPdf());
  await rail(page).getByRole('button', { name: 'Embedded files' }).click();
  const files = page.getByRole('list', { name: 'Embedded files' });
  await expect(files.locator('[data-pdf-embedded-file]')).toHaveCount(2);
  await expect(
    files.locator('[data-pdf-embedded-file="1"] [data-pdf-embedded-runs]'),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('pdf-embedded-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-embedded-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  const download = page.waitForEvent('download');
  await files.getByRole('button', { name: 'Save notes.txt' }).click();
  expect((await download).suggestedFilename()).toBe('notes.txt');

  // An embedded PDF opens as a new PDF document; a file that only says it is one is refused on its row.
  await openPdf(page, 'Holding a PDF.pdf', embeddedPdfPdf());
  const held = page.getByRole('list', { name: 'Embedded files' });
  await held.getByRole('button', { name: 'Open fake.pdf' }).click();
  await expect(held.locator('[data-pdf-embedded-file="1"]')).toContainText(
    'This file isn’t a PDF.',
  );
  const before = page.url();
  await held.getByRole('button', { name: 'Open inner.pdf' }).click();
  await expect(page).not.toHaveURL(before, { timeout: 30_000 });
  await pageOneDrawn(page);

  // "Layers": as the file sets them, then shown and hidden for this person, the page drawn again with them.
  await openPdf(page, 'Layered.pdf', layeredDrawingPdf());
  await rail(page).getByRole('button', { name: 'Layers' }).click();
  const layers = page.getByRole('list', { name: 'Layers' });
  const notes = layers.getByRole('button', { name: 'Notes' });
  await expect(notes).toHaveAttribute('aria-pressed', 'false');
  // The red square of "Notes", 350 points in and up, and the black one of "Plan", 122.
  const colourAt = (x: number, y: number) =>
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
  await expect.poll(() => colourAt(350, 350)).toEqual([255, 255, 255]);
  await notes.click();
  await expect(notes).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => colourAt(350, 350), { timeout: 15_000 }).toEqual([255, 0, 0]);
  await layers.getByRole('button', { name: 'Plan' }).click();
  await expect.poll(() => colourAt(122, 122), { timeout: 15_000 }).toEqual([255, 255, 255]);
  await page.screenshot({ path: test.info().outputPath('pdf-layers-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-layers-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });

  expectNoPageErrors(pageErrors);
});
