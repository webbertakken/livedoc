import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// A PDF document end to end (docs/specs/035-pdf-documents/files-print-and-sync.md "Opening", "Downloading";
// saving.md "An unchanged file", "Addition or rewrite", "The validators' claim"; marks.md "Making a mark", "In the
// file"; docs/specs/006-document/blob-store.md): a PDF dropped on the Explorer, its bytes stored exactly, opened on its
// surface, page one drawn with the chrome in the dark and the light scheme, one highlight made in one browser and
// seen in a second, downloaded, validated, the stored file proven untouched inside the download, and the download
// dropped again and opened with its highlight.

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
const READY = '[data-pdf-surface="ready"]';
const PAGE_ONE = '[data-pdf-page="1"]';
// The fixture's line of text sits 72 points in and 720 up a US Letter page, 12 points tall.
const LETTER = { width: 612, height: 792 };
const LINE = { left: 72, middle: LETTER.height - 720 - 4 };

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Drops a PDF from the computer on the page, as a person drags a file onto the window. */
async function dropPdf(page: Page, name: string, bytes: Uint8Array): Promise<void> {
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
async function pageOneDrawn(page: Page) {
  const first = page.locator(PAGE_ONE);
  await expect(page.locator(READY)).toBeVisible({ timeout: 30_000 });
  await expect(first).toHaveAttribute('data-pdf-page-drawn', 'true', { timeout: 30_000 });
  return first;
}

/** What page one's picture holds: the colour of its top left corner, and whether anything is drawn on it. */
function pictureOf(page: Page) {
  return page.locator(`${PAGE_ONE} canvas`).evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let inked = 0;
    for (let at = 0; at < data.length; at += 4) if (data[at]! < 128) inked += 1;
    return { corner: [data[0], data[1], data[2]], inked, width: canvas.width };
  });
}

const groundOf = (page: Page) =>
  page.locator('[data-pdf-surface]').evaluate((el) => getComputedStyle(el).backgroundColor);

async function peerOn(browser: Browser, baseURL: string, code: string): Promise<Page> {
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

test('a PDF dropped on the Explorer is stored, read, highlighted together and leaves as a valid PDF holding it', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(180_000);
  const stored = await textPdf(2);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();

  // Dropped on the Explorer: a PDF document, opened at once.
  await dropPdf(page, 'Lease agreement.pdf', stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const id = new URL(page.url()).pathname.split('/')[2]!;
  await expect(page.locator('[data-pdf-pages="2"]')).toBeVisible();
  await expect(first).toHaveAccessibleName('Page 1 of 2');

  // Its bytes are stored exactly, under their SHA-256, and the tab names them.
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  const liveDoc = (await (
    await page.request.get(`${apiBase}/documents/${id}`, { headers })
  ).json()) as { document: { name: string; tabs: { id: string; kind: string }[] } };
  const [tab] = liveDoc.document.tabs;
  expect(liveDoc.document.name).toBe('Lease agreement');
  expect(tab?.kind).toBe('pdf');
  const state = await page.request.get(
    `${apiBase}/documents/${id}/pdf-documents/${tab!.id}/state`,
    { headers },
  );
  const key = state.headers()['x-stored-file']!;
  expect(key).toBe(sha256(stored));
  const held = await page.request.get(`${apiBase}/documents/${id}/files/${key}`, { headers });
  expect(sha256(await held.body())).toBe(sha256(stored));
  const range = await page.request.get(`${apiBase}/documents/${id}/files/${key}`, {
    headers: { ...headers, Range: 'bytes=0-4' },
  });
  expect([range.status(), (await range.body()).toString()]).toEqual([206, '%PDF-']);

  // Page one is drawn as the file says, on white paper, with the chrome dark in the dark scheme and light in the
  // light one (reading-surface.md "Layout": the pages are as the file says in both schemes).
  const dark = await pictureOf(page);
  expect(dark.corner).toEqual([255, 255, 255]);
  expect(dark.inked).toBeGreaterThan(100);
  const darkGround = await groundOf(page);
  await page.screenshot({ path: test.info().outputPath('pdf-document-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => groundOf(page)).not.toBe(darkGround);
  expect((await pictureOf(page)).corner).toEqual([255, 255, 255]);
  await page.screenshot({ path: test.info().outputPath('pdf-document-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });

  // A second browser opens the same PDF through an edit link.
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'edit' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;
  const peer = await peerOn(browser, baseURL!, code);
  await pageOneDrawn(peer);
  await expect(peer.locator('[data-pdf-mark]')).toHaveCount(0);

  // One highlight, made with the Highlight tool by dragging across the first line.
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await expect(page.locator('[data-pdf-tool="highlight"]')).toBeVisible();
  const box = (await first.boundingBox())!;
  const scale = box.width / LETTER.width;
  const y = box.y + LINE.middle * scale;
  await page.mouse.move(box.x + (LINE.left + 2) * scale, y);
  await page.mouse.down();
  await page.mouse.move(box.x + (LINE.left + 120) * scale, y, { steps: 6 });
  await page.mouse.move(box.x + (LINE.left + 200) * scale, y, { steps: 6 });
  await page.mouse.up();
  const mark = page.locator(`${PAGE_ONE} [data-pdf-mark]`);
  await expect(mark).toHaveCount(1);
  await expect(mark).toHaveAttribute('data-pdf-mark-kind', 'highlight');
  const markId = (await mark.getAttribute('data-pdf-mark'))!;
  await page.screenshot({ path: test.info().outputPath('pdf-document-highlight.png') });

  // The other browser sees it, on the same page, as it is made.
  await expect(peer.locator(`${PAGE_ONE} [data-pdf-mark="${markId}"]`)).toHaveCount(1);
  await peer.screenshot({ path: test.info().outputPath('pdf-document-highlight-peer.png') });

  // The room stored it before it relayed it (live-editing-and-storage.md "Storage"): the state now holds a change.
  const changed = await page.request.get(
    `${apiBase}/documents/${id}/pdf-documents/${tab!.id}/state`,
    { headers },
  );
  expect((await changed.body()).length).toBeGreaterThan(2);

  // Downloaded: a valid PDF whose first bytes are the stored file, untouched, with the highlight appended.
  const downloadItem = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), downloadItem.click()]);
  expect(download.suggestedFilename()).toBe('Lease agreement.pdf');
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-document-')), 'Lease agreement.pdf');
  await download.saveAs(file);
  const baked = readFileSync(file);
  expect(baked.length).toBeGreaterThan(stored.length);
  expect(sha256(baked.subarray(0, stored.length))).toBe(sha256(stored));
  expect(baked.subarray(stored.length).toString('latin1')).toContain('/Highlight');
  execFileSync('qpdf', ['--check', file], { stdio: 'pipe' });

  // The download dropped again: a new PDF document, whose file itself now holds the highlight, under its own id.
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Lease agreement, reviewed.pdf', baked);
  await page.waitForURL(
    (url) => url.pathname.startsWith('/document/') && !url.pathname.includes(id),
  );
  const reopened = await pageOneDrawn(page);
  await expect(reopened).toHaveAttribute('data-pdf-file-marks', markId);
  await expect(page.locator('[data-pdf-mark]')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('pdf-document-reopened.png') });

  expectNoPageErrors(pageErrors);
});
