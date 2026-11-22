import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { dragAcrossFirstLine, dropPdf, PAGE_ONE, pageOneDrawn, sha256 } from './pdf-document-pages';

// A PDF document in This Browser (docs/specs/035-pdf-documents/live-editing-and-storage.md "Offline and This
// Browser"; docs/specs/006-document/blob-store.md "This Browser"), in a real browser with its own file system: Take
// Offline keeps the stored file and the live changes here before the server copy goes; the PDF then opens, is changed
// and is saved with no room; a Duplicate carries the changes and names the same file; Sync Document sends the file
// first and the changes with the create; and a cloud PDF's file, once read, is read again from this browser.

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
const MARKS = `${PAGE_ONE} [data-pdf-mark]`;
const NAME = 'Lease agreement';

/**
 * The files this browser's own store holds whole, by name, in the origin private file system. A file still being
 * written is there by name and empty until its write is closed: it is not held yet.
 */
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

/** How many PDF tabs of the document's offline record hold live changes; null when this browser has no record. */
const savedStates = (page: Page, id: string) =>
  page.evaluate(
    (documentId) =>
      new Promise<number | null>((resolve, reject) => {
        const open = indexedDB.open('livedoc-offline');
        open.onsuccess = () => {
          const read = open.result
            .transaction('documents')
            .objectStore('documents')
            .get(documentId);
          read.onsuccess = () => {
            open.result.close();
            const rec = read.result as { pdfDocuments?: unknown[] } | undefined;
            resolve(rec ? (rec.pdfDocuments?.length ?? 0) : null);
          };
          read.onerror = () => reject(read.error ?? new Error('read failed'));
        };
        open.onerror = () => reject(open.error ?? new Error('open failed'));
      }),
    id,
  );

async function highlight(page: Page, from: number, to: number): Promise<void> {
  const before = await page.locator(MARKS).count();
  if ((await page.locator('[data-pdf-tool="highlight"]').count()) === 0)
    await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await dragAcrossFirstLine(page, await pageOneDrawn(page), { from, to });
  await expect(page.locator(MARKS)).toHaveCount(before + 1);
}

/** A row's menu in the Explorer, by the document's name. */
async function rowMenu(page: Page, name: string, item: string): Promise<void> {
  await page
    .getByRole('button', { name: `Menu for ${name}`, exact: true })
    .first()
    .click();
  await page.getByRole('menu').last().getByText(item, { exact: true }).click();
}

const saveStatus = (page: Page) => page.locator('[data-save-status]').first();

test('a PDF is taken offline with its file and changes, changed in This Browser, copied, and synced back', async ({
  page,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(240_000);
  const stored = await textPdf(2);
  const key = sha256(stored);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, `${NAME}.pdf`, stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  await highlight(page, 2, 120);
  await expect(saveStatus(page)).toHaveAttribute('data-save-status', 'saved');

  // "A cloud PDF document keeps ... its stored file in the same local store once read whole: the next open reads the
  // file from this browser." The file is asked of LiveDoc no second time.
  await expect.poll(() => keptFiles(page)).toEqual([key]);
  const fileReads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes(`/files/${key}`))
      fileReads.push(request.url());
  });
  await page.reload();
  await pageOneDrawn(page);
  await expect(page.locator(MARKS)).toHaveCount(1);
  expect(fileReads).toEqual([]);

  // Take Offline: the bytes and the live changes are here before the server copy goes.
  await page.goto('/explorer/all');
  await rowMenu(page, NAME, 'Take Offline');
  await page.getByRole('button', { name: 'Take Offline', exact: true }).click();
  await expect.poll(() => savedStates(page, id), { timeout: 30_000 }).toBe(1);
  await expect
    .poll(async () => (await page.request.get(`${apiBase}/documents/${id}`, { headers })).status())
    .toBe(404);
  expect(await keptFiles(page)).toEqual([key]);

  // It opens from this browser alone, with the highlight made on LiveDoc, and says where it is kept.
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes(`/documents/${id}`)) requests.push(request.url());
  });
  await page.goto(`/document/${id}`);
  await pageOneDrawn(page);
  await expect(page.locator(MARKS)).toHaveCount(1);
  await expect(saveStatus(page)).toHaveAttribute('data-save-status', 'this-browser');
  expect(requests).toEqual([]);

  // A change made here is saved in the record, and is back after a reload.
  await highlight(page, 130, 240);
  await expect(saveStatus(page)).toHaveAttribute('data-save-status', 'this-browser');
  await page.reload();
  await pageOneDrawn(page);
  await expect(page.locator(MARKS)).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath('pdf-this-browser.png') });

  // Download bakes in this browser from the bytes kept here.
  const downloadItem = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), downloadItem.click()]);
  expect(download.suggestedFilename()).toBe(`${NAME}.pdf`);
  const baked = readFileSync(await download.path());
  // The stored file, untouched, with the two highlights added after it.
  expect(sha256(baked.subarray(0, stored.byteLength))).toBe(key);
  expect(baked.byteLength).toBeGreaterThan(stored.byteLength);

  // Duplicate: the copy holds the changes and names the same file, so this browser keeps one file still.
  await page.goto('/explorer/offline');
  await rowMenu(page, NAME, 'Duplicate');
  const copyName = `${NAME} copy`;
  await expect(
    page.getByRole('button', { name: `Menu for ${copyName}`, exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  expect(await keptFiles(page)).toEqual([key]);
  await page.getByText(copyName, { exact: true }).first().click();
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);
  expect(new URL(page.url()).pathname.split('/')[2]).not.toBe(id);
  await expect(page.locator(MARKS)).toHaveCount(2);

  // Sync Document: the file goes to the blob store, then the create carries the tab and its live changes.
  await page.goto('/explorer/offline');
  await rowMenu(page, NAME, 'Sync Document');
  await expect.poll(() => savedStates(page, id), { timeout: 30_000 }).toBeNull();
  const file = await page.request.get(`${apiBase}/documents/${id}/files/${key}`, { headers });
  expect(file.status()).toBe(200);
  expect(sha256(new Uint8Array(await file.body()))).toBe(key);
  await page.goto(`/document/${id}`);
  await pageOneDrawn(page);
  await expect(page.locator(MARKS)).toHaveCount(2);
  await expect(saveStatus(page)).toHaveAttribute('data-save-status', 'saved');
  // The copy is in This Browser still, so its file is never forgotten.
  expect(await keptFiles(page)).toEqual([key]);
  expectNoPageErrors(pageErrors);
});
