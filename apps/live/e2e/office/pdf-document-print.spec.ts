import { pageTextsOf, textPdf } from '@livedoc/pdf-documents/testing';
import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn } from './pdf-document-pages';

// files-print-and-sync.md "Printing": Print and ⌘P open LiveDoc's small dialog; the browser is handed the file cut
// to the pages chosen, in a frame out of sight; a browser that shows no PDF is handed the pages as pictures.

type Kept = { frames: string[]; files: { url: string; type: string }[] };

// What the print frames were handed, kept: a headless browser's print returns at once, so a frame and its files are
// gone before a test could look. `showsPdf`: what the browser says of `navigator.pdfViewerEnabled`.
async function watchPrints(page: Page, showsPdf: boolean) {
  await page.addInitScript((shows) => {
    Object.defineProperty(Navigator.prototype, 'pdfViewerEnabled', { get: () => shows });
    const kept: Kept = { frames: [], files: [] };
    Object.assign(window, { __prints: kept });
    const make = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (made) => {
      const url = make(made);
      if (made instanceof Blob) kept.files.push({ url, type: made.type });
      return url;
    };
    URL.revokeObjectURL = () => {};
    new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.addedNodes)
          if (node instanceof HTMLIFrameElement && node.dataset.pdfPrintFrame)
            kept.frames.push(node.dataset.pdfPrintFrame);
    }).observe(document, { childList: true, subtree: true });
  }, showsPdf);
}

const printsOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __prints: Kept }).__prints);

async function opened(page: Page, showsPdf: boolean) {
  await watchPrints(page, showsPdf);
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Minutes.pdf', await textPdf(3));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);
}

async function printFromToolbar(
  page: Page,
  pick: (dialog: ReturnType<Page['getByRole']>) => Promise<void>,
) {
  await page
    .getByRole('toolbar', { name: 'Toolbar' })
    .getByRole('button', { name: 'Print' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Print' });
  await pick(dialog);
  await dialog.getByRole('button', { name: 'Print' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await printsOf(page)).frames).toHaveLength(1);
  return printsOf(page);
}

test('Print hands the browser the pages chosen, cut from the file', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await opened(page, true);

  // ⌘P opens LiveDoc's dialog, never the browser's print of the page; Escape closes it.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('ControlOrMeta+p');
  const dialog = page.getByRole('dialog', { name: 'Print' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const prints = await printFromToolbar(page, async (asked) => {
    await asked.getByRole('radio', { name: 'Pages' }).check();
    await asked.getByRole('textbox', { name: 'Pages to print' }).fill('3, 2');
    await page.screenshot({ path: test.info().outputPath('pdf-print-dialog.png') });
  });
  expect(prints.frames).toEqual(['pdf']);
  const file = prints.files.find((made) => made.type === 'application/pdf')!;
  const bytes = await page.evaluate(
    async (url) => [...new Uint8Array(await (await fetch(url)).arrayBuffer())],
    file.url,
  );
  expect(await pageTextsOf(Uint8Array.from(bytes))).toEqual([
    expect.stringContaining('Page 2'),
    expect.stringContaining('Page 3'),
  ]);
  expectNoPageErrors(pageErrors);
});

test('Print hands a browser that shows no PDF the page as a picture at the print resolution', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await opened(page, false);
  const prints = await printFromToolbar(page, async (asked) => {
    await asked.getByRole('radio', { name: 'Current page' }).check();
  });
  expect(prints.frames).toEqual(['pictures']);
  const pictures = prints.files.filter((made) => made.type === 'image/jpeg');
  expect(pictures).toHaveLength(1);
  // 612 points at 150 dots an inch.
  const width = await page.evaluate(
    async (url) => (await createImageBitmap(await (await fetch(url)).blob())).width,
    pictures[0]!.url,
  );
  expect(width).toBe(Math.round((612 * 150) / 72));
  expectNoPageErrors(pageErrors);
});
