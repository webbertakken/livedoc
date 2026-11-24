import { taggedPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn, pageScale, pinch } from './pdf-document-pages';

// A PDF on a phone (docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet"): a pinch on the pages zooms the
// pages about the fingers, never the page around them; one finger is the browser's own scroll.

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

const zoomShown = async (page: import('@playwright/test').Page): Promise<number> =>
  Number.parseFloat(await page.getByRole('combobox', { name: 'Zoom' }).inputValue());

test('a pinch on a PDF’s pages zooms the pages, not the page around them', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Annual report.pdf', taggedPdf());
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  const pages = page.locator('[data-pdf-pages]');
  await expect(pages).toHaveCSS('touch-action', 'pan-x pan-y');
  const before = await zoomShown(page);
  const box = (await pages.boundingBox())!;
  await pinch(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });

  await expect.poll(() => zoomShown(page)).toBeGreaterThan(before * 2);
  expect(await pageScale(page)).toBe(1);
  await page.screenshot({ path: test.info().outputPath('pdf-pages-pinched.png') });

  expectNoPageErrors(pageErrors);
});
