import type { Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import {
  dragAcrossFirstLine,
  dropPdf,
  PAGE_ONE,
  pageOneDrawn,
  sha256,
} from '../office/pdf-document-pages';

// A guest's PDF where sign-in is offered (docs/specs/035-pdf-documents/files-print-and-sync.md "Opening": "Where it
// is kept is where a new document is"; live-editing-and-storage.md "A PDF that arrives"): the file is kept in this
// browser and named by an offline record, no request carries its bytes or its name, and it is reviewed there with
// no room. Sync Document is the guest's own act, and only then does the file travel.

test.use({ colorScheme: 'dark' });

const MARKS = `${PAGE_ONE} [data-pdf-mark]`;
const NAME = 'Tenancy agreement';

/** The files this browser's own store holds whole, by name. */
const keptFiles = (page: Page) =>
  page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const blobs = await root.getDirectoryHandle('blobs', { create: true });
    type Entry = [string, { getFile: () => Promise<File> }];
    const names: string[] = [];
    for await (const [name, handle] of (
      blobs as unknown as { entries: () => AsyncIterable<Entry> }
    ).entries())
      if ((await handle.getFile()).size > 0) names.push(name);
    return names.sort();
  });

test('a guest’s dropped PDF is kept in This Browser, and travels only when they sync it', async ({
  page,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  const stored = await textPdf(2);
  const key = sha256(stored);
  // Everything this browser sends that could carry the file, its key or its name.
  const sent: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    const body = request.postData() ?? '';
    if (
      /\/api\/files\b/.test(url) ||
      url.includes(key) ||
      body.includes(key) ||
      body.includes(NAME)
    )
      sent.push(`${request.method()} ${new URL(url).pathname}`);
  });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, `${NAME}.pdf`, stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const id = new URL(page.url()).pathname.split('/')[2]!;

  // Kept here, saved here, and nowhere else.
  await expect(page.locator('[data-save-status]').first()).toHaveAttribute(
    'data-save-status',
    'this-browser',
  );
  expect(await keptFiles(page)).toEqual([key]);
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await dragAcrossFirstLine(page, first);
  await expect(page.locator(MARKS)).toHaveCount(1);
  // Reloaded at once, before the change is saved (PDF_LOCAL_SAVE_MS): the browser never finishes a save begun as
  // the page goes, so the highlight comes back from the page's parting copy ("A page's last moment"), which has
  // joined the record by the time the page is drawn.
  await page.reload();
  await pageOneDrawn(page);
  await expect(page.locator(MARKS)).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () => Object.keys(localStorage).filter((key) => key.includes('live-tab-parting')).length,
      ),
    )
    .toBe(0);
  await page.screenshot({ path: test.info().outputPath('pdf-guest-this-browser.png') });
  expect(sent).toEqual([]);
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  expect((await page.request.get(`/api/documents/${id}`, { headers })).status()).toBe(404);

  // Sync Document: the guest's own act sends the file, then the document with its highlight.
  await page.goto('/explorer/offline');
  await page
    .getByRole('button', { name: `Menu for ${NAME}`, exact: true })
    .first()
    .click();
  await page.getByRole('menu').last().getByText('Sync Document', { exact: true }).click();
  await expect
    .poll(async () => (await page.request.get(`/api/documents/${id}`, { headers })).status(), {
      timeout: 30_000,
    })
    .toBe(200);
  const file = await page.request.get(`/api/documents/${id}/files/${key}`, { headers });
  expect(sha256(new Uint8Array(await file.body()))).toBe(key);
  expect(sent.some((line) => line.includes('/api/files/'))).toBe(true);
  await page.goto(`/document/${id}`);
  await pageOneDrawn(page);
  await expect(page.locator(MARKS)).toHaveCount(1);
  await expect(page.locator('[data-save-status]').first()).toHaveAttribute(
    'data-save-status',
    'saved',
  );
  expectNoPageErrors(pageErrors);
});
