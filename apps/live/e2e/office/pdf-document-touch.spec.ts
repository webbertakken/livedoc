import { COLUMNS_RIGHT_LEFT, columnsPdf, taggedPdf } from '@livedoc/pdf-documents/testing';
import { PDF_PAGES_PAD_PX as PAD } from '../../lib/pdf-document/pdf-page-layout';
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

// "Reduced motion": no animated scroll to a page; the page appears where asked, nothing on the surface moving.
test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('going to a page shows it at once, nothing easing there', async ({ page, pageErrors }) => {
    test.setTimeout(120_000);
    await page.goto('/explorer/all');
    await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
    await dropPdf(page, 'Annual report.pdf', taggedPdf());
    await page.waitForURL(/\/document\//, { timeout: 30_000 });
    await pageOneDrawn(page);

    // Every frame for a quarter of a second from Enter: at most one jump, from the first page to the second, and
    // often done before the first frame.
    const field = page.getByRole('textbox', { name: 'Page' });
    await field.fill('2');
    const sampled = page.evaluate(
      () =>
        new Promise<{ tops: number[]; moving: number }>((done) => {
          const pages = document.querySelector<HTMLElement>('[data-pdf-pages]')!;
          const tops: number[] = [];
          let moving = 0;
          const frame = () => {
            tops.push(Math.round(pages.scrollTop));
            moving = Math.max(moving, document.getAnimations().length);
            if (tops.length < 15) requestAnimationFrame(frame);
            else done({ tops, moving });
          };
          requestAnimationFrame(frame);
        }),
    );
    await field.press('Enter');
    const { tops, moving } = await sampled;
    expect(new Set(tops).size).toBeLessThanOrEqual(2);
    expect(tops.at(-1)).toBeGreaterThan(0);
    expect(moving).toBe(0);
    await expect(page.locator('[data-pdf-page="2"]')).toBeInViewport();

    expectNoPageErrors(pageErrors);
  });
});

// "A double tap zooms to the column under the finger and back": the column fills the view's width less the pages'
// pad either side, its left at the view's left; a second double tap goes back to the zoom before.
test('a double tap zooms to the column under the finger, and another goes back', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Two columns.pdf', await columnsPdf());
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  const pages = page.locator('[data-pdf-pages]');
  const sheet = page.locator('[data-pdf-page="1"]');
  const before = await zoomShown(page);
  const doubleTap = async (across: number, down: number) => {
    const box = (await sheet.boundingBox())!;
    const x = box.x + (across / 612) * box.width;
    const y = box.y + (down / 792) * box.height;
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
  };
  // The right column's third line, 690 - 28 up from the page's foot.
  await doubleTap(COLUMNS_RIGHT_LEFT + 20, 792 - 662 - 4);

  await expect.poll(() => zoomShown(page)).toBeGreaterThan(before * 2);
  const view = (await pages.boundingBox())!;
  await expect
    .poll(async () => {
      const box = (await sheet.boundingBox())!;
      return Math.round(box.x + (COLUMNS_RIGHT_LEFT / 612) * box.width - view.x);
    })
    .toBeGreaterThanOrEqual(PAD - 2);
  const box = (await sheet.boundingBox())!;
  expect(box.x + (COLUMNS_RIGHT_LEFT / 612) * box.width - view.x).toBeLessThanOrEqual(PAD + 2);
  await page.screenshot({ path: test.info().outputPath('pdf-column-zoomed.png') });

  await doubleTap(COLUMNS_RIGHT_LEFT + 20, 792 - 662 - 4);
  await expect.poll(() => zoomShown(page)).toBe(before);
  // A finger's presses in a row zoom, never select.
  await expect(page.locator('[data-pdf-text-selection]')).toHaveCount(0);

  expectNoPageErrors(pageErrors);
});
