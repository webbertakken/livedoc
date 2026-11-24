import { taggedPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn } from './pdf-document-pages';

// docs/specs/035-pdf-documents/accessibility.md "Seeing": the chrome reflows at 400% browser zoom of a 1280 px window, which is a window 320 px wide; the pages, a
// fixed layout, scroll in both directions inside their own region. Below 600 px the menus are behind More.
test('a PDF’s chrome reflows at 400% zoom, nothing of it scrolling sideways', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Annual report.pdf', taggedPdf());
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  await page.setViewportSize({ width: 320, height: 215 });
  await expect(page.getByRole('toolbar', { name: 'Toolbar' })).toBeVisible();
  const sideways = await page.evaluate(() => {
    const root = document.scrollingElement!;
    return root.scrollWidth - root.clientWidth;
  });
  expect(sideways).toBeLessThanOrEqual(0);
  await expect(
    page.locator('[data-region="header"]').getByRole('button', { name: 'More' }),
  ).toBeVisible();
  for (const region of ['header', 'toolbar', 'pagebar']) {
    const box = (await page.locator(`[data-region="${region}"]`).first().boundingBox())!;
    expect(box.x, region).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, region).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: test.info().outputPath('pdf-zoom-400.png') });

  expectNoPageErrors(pageErrors);
});
