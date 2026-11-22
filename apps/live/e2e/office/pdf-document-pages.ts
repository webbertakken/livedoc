import type { Browser, Locator, Page } from '@playwright/test';
import { expect } from '../fixtures';

// What the PDF document's end-to-end specs share: getting a PDF onto its surface, a second browser on it, and a
// drag across the fixture's line of text (`textPdf` of `@livedoc/pdf-documents/testing`).

export const READY = '[data-pdf-surface="ready"]';
export const PAGE_ONE = '[data-pdf-page="1"]';
// The fixture's line of text sits 72 points in and 720 up a US Letter page, 12 points tall.
const LETTER = { width: 612, height: 792 };
const LINE = { left: 72, middle: LETTER.height - 720 - 4 };

/** Drops a PDF from the computer on the page, as a person drags a file onto the window. */
export async function dropPdf(page: Page, name: string, bytes: Uint8Array): Promise<void> {
  const transfer = await page.evaluateHandle(
    ({ fileName, base64 }) => {
      const binary = atob(base64);
      const data = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([data], fileName, { type: 'application/pdf' }));
      return dataTransfer;
    },
    { fileName: name, base64: Buffer.from(bytes).toString('base64') },
  );
  await page.dispatchEvent('body', 'dragover', { dataTransfer: transfer });
  await page.dispatchEvent('body', 'drop', { dataTransfer: transfer });
}

/** Page one, once the engine has drawn it. */
export async function pageOneDrawn(page: Page): Promise<Locator> {
  const first = page.locator(PAGE_ONE);
  await expect(page.locator(READY)).toBeVisible({ timeout: 30_000 });
  await expect(first).toHaveAttribute('data-pdf-page-drawn', 'true', { timeout: 30_000 });
  return first;
}

/** A second browser on the document, through a share link. */
export async function peerOn(browser: Browser, baseURL: string, code: string): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL,
    colorScheme: 'dark',
    viewport: { width: 1280, height: 860 },
  });
  const page = await ctx.newPage();
  await page.goto(`/document/shared?s=${code}`);
  // A visitor joins under a name when the welcome asks for one; the pages show either way.
  const join = page.getByRole('button', { name: /^join$/i });
  await expect(join.or(page.locator(READY))).toBeVisible({ timeout: 30_000 });
  if (await join.isVisible()) await join.click();
  return page;
}

/**
 * Drags across the fixture's first line of text on page one, from `from` to `to` points past its left edge: with
 * the Highlight tool in hand, one highlight.
 */
export async function dragAcrossFirstLine(
  page: Page,
  first: Locator,
  { from = 2, to = 200 }: { from?: number; to?: number } = {},
): Promise<void> {
  const box = (await first.boundingBox())!;
  const scale = box.width / LETTER.width;
  const y = box.y + LINE.middle * scale;
  await page.mouse.move(box.x + (LINE.left + from) * scale, y);
  await page.mouse.down();
  await page.mouse.move(box.x + (LINE.left + (from + to) / 2) * scale, y, { steps: 6 });
  await page.mouse.move(box.x + (LINE.left + to) * scale, y, { steps: 6 });
  await page.mouse.up();
}
