import type { Page } from '@playwright/test';
import { labelledPdf, textPdf } from '@livedoc/pdf-documents/testing';
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
      .getByRole('button')
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

  expectNoPageErrors(pageErrors);
});
