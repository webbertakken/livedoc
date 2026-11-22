import type { Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn } from './pdf-document-pages';

// docs/specs/006-document/kinds-outside-the-canvas.md "The canvas's code" and "The Explorer": a document whose first
// tab is a PDF opens straight onto its surface, and the canvas's code is asked for never, at the open or once the
// document has settled. The loader says each load as a trace line, which a production build prints when the
// browser's debug flag asks for its scope (docs/specs/003-system-architecture/console-logging.md).

test.use({ colorScheme: 'dark' });

/** The trace lines of the canvas's loader and of a PDF's open, as the page writes them from now on. */
async function traced(page: Page): Promise<string[]> {
  await page.addInitScript(() => localStorage.setItem('livedoc:debug', 'canvas-code,pdf'));
  const lines: string[] = [];
  page.on('console', (message) => {
    if (/^\[(canvas-code|pdf)\] /.test(message.text())) lines.push(message.text());
  });
  return lines;
}

/** Past the moment a settled document asks for the canvas's code: two idle turns of the page. */
const settled = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestIdleCallback(() => requestIdleCallback(() => resolve()));
      }),
  );

test('opening a PDF asks for none of the canvas’s code', async ({ page, pageErrors }) => {
  const lines = await traced(page);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Service agreement.pdf', await textPdf(2));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  // A cold open of the document, as a link to it opens: nothing the Explorer fetched ahead counts.
  lines.length = 0;
  await page.reload();
  await pageOneDrawn(page);
  await settled(page);
  expect(lines.some((line) => line.startsWith('[pdf] opened '))).toBe(true);
  expect(lines.filter((line) => line.startsWith('[canvas-code] '))).toEqual([]);
  // The canvas is not mounted, nor the paper that holds its place while it loads.
  await expect(page.locator('[data-canvas-root], [data-testid="canvas-placeholder"]')).toHaveCount(
    0,
  );
  expectNoPageErrors(pageErrors);
});

// The same probe on a canvas document, so the test above cannot pass by hearing nothing at all.
test('a canvas document asks for the canvas’s code at the open', async ({ page }) => {
  const lines = await traced(page);
  await page.goto('/new?blank=1');
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await expect
    .poll(() => lines.some((line) => line.startsWith('[canvas-code] load reason=')), {
      timeout: 30_000,
    })
    .toBe(true);
});
