import type { BrowserContext, Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { copiesKept, cuttableContext } from './live-tab-offline';
import {
  dragAcrossFirstLine,
  dropPdf,
  joinOn,
  PAGE_ONE,
  pageOneDrawn,
  replaceStoredFile,
  sha256,
} from './pdf-document-pages';

// A PDF document's live merge (docs/specs/035-pdf-documents/live-editing-and-storage.md "Undo", "Storage"
// (reconnecting), "Offline and This Browser" (the local copy), "A change carried across a replacement"): a person
// takes back only their own change and makes it again; what they mark with their room down reaches everyone once it
// is back, also after they closed the tab offline; and what they marked while the stored file was replaced under
// them is carried onto the new file, from the open surface and from a local copy left behind. Nothing is lost.

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
// The database a PDF document's local copies are kept in.
const COPIES = 'livedoc-pdf-documents';
const MARKS = `${PAGE_ONE} [data-pdf-mark]`;

const markIds = (page: Page) =>
  page
    .locator(MARKS)
    .evaluateAll((marks) => marks.map((mark) => mark.getAttribute('data-pdf-mark')!).sort());

/** Highlights a stretch of the first line, and answers the new mark's id. */
async function highlight(page: Page, from: number, to: number): Promise<string> {
  const before = await markIds(page);
  if ((await page.locator('[data-pdf-tool="highlight"]').count()) === 0)
    await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await dragAcrossFirstLine(page, await pageOneDrawn(page), { from, to });
  await expect(page.locator(MARKS)).toHaveCount(before.length + 1);
  return (await markIds(page)).find((id) => !before.includes(id))!;
}

/** A participant's page on the document, in a browser whose connection can be cut. */
async function participant(ctx: BrowserContext, code: string): Promise<Page> {
  const page = await joinOn(ctx, code);
  await pageOneDrawn(page);
  return page;
}

test('a PDF’s changes are undone by their maker, survive a lost connection, and are carried across a replacement', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(240_000);
  const stored = await textPdf(2);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Lease agreement.pdf', stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const origin = new URL(baseURL!).origin;
  const headers = await pageOwnerHeaders(page, { Origin: origin });
  const liveDoc = (await (
    await page.request.get(`${apiBase}/documents/${id}`, { headers })
  ).json()) as { document: { tabs: { id: string }[] } };
  const tabId = liveDoc.document.tabs[0]!.id;
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'participate' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;
  const { ctx, link } = await cuttableContext(browser, baseURL!);
  let peer = await participant(ctx, code);
  const undo = (on: Page) => on.getByRole('button', { name: 'Undo', exact: true });
  const redo = (on: Page) => on.getByRole('button', { name: 'Redo', exact: true });

  // Undo: with nothing made, there is nothing to take back.
  await expect(undo(peer)).toHaveAttribute('aria-disabled', 'true');

  // A mark is its maker's to take back, by the key and by the toolbar; the other person's Undo stays dimmed.
  const first = await highlight(peer, 2, 50);
  await expect(page.locator(`${PAGE_ONE} [data-pdf-mark="${first}"]`)).toHaveCount(1);
  await expect(undo(page)).toHaveAttribute('aria-disabled', 'true');
  await peer.keyboard.press('Control+z');
  await expect(peer.locator(MARKS)).toHaveCount(0);
  await expect(page.locator(MARKS)).toHaveCount(0);
  await expect(undo(peer)).toHaveAttribute('aria-disabled', 'true');
  await redo(peer).click();
  await expect(page.locator(`${PAGE_ONE} [data-pdf-mark="${first}"]`)).toHaveCount(1);
  await peer.screenshot({ path: test.info().outputPath('pdf-merge-undo.png') });

  // Reconnecting: marked with the room down, shown here at once and to the other person once it is back.
  await link.cut();
  const offline = await highlight(peer, 60, 110);
  await expect(page.locator(MARKS)).toHaveCount(1);
  await peer.screenshot({ path: test.info().outputPath('pdf-merge-offline.png') });
  await link.restore();
  await expect(page.locator(`${PAGE_ONE} [data-pdf-mark="${offline}"]`)).toHaveCount(1, {
    timeout: 30_000,
  });

  // The local copy: marked offline, the tab closed, and opened again with the room back.
  await link.cut();
  const left = await highlight(peer, 120, 170);
  await expect.poll(() => peer.evaluate(copiesKept, COPIES)).toBe(1);
  await peer.close();
  await link.restore();
  peer = await participant(ctx, code);
  await expect(page.locator(`${PAGE_ONE} [data-pdf-mark="${left}"]`)).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(peer.locator(MARKS)).toHaveCount(3);
  await expect.poll(() => peer.evaluate(copiesKept, COPIES)).toBe(0);

  // A change carried across a replacement: marked with the room down while the stored file is replaced by its bake.
  await link.cut();
  const carried = await highlight(peer, 180, 230);
  const firstKey = sha256(stored);
  const secondKey = await replaceStoredFile(page, {
    origin,
    id,
    tabId,
    headers,
    from: firstKey,
    pages: 2,
  });
  // The Editor is on the new file: the three marks the room held are the file's own now.
  await expect(page.locator(MARKS)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator(PAGE_ONE)).toHaveAttribute(
    'data-pdf-file-marks',
    new RegExp(`(?=.*${first})(?=.*${offline})(?=.*${left})`),
    { timeout: 30_000 },
  );
  await link.restore();
  // The Participant opens the new file in place, and the mark the room never had is made again on it, for both.
  await expect(peer.locator(PAGE_ONE)).toHaveAttribute('data-pdf-file-marks', new RegExp(first), {
    timeout: 30_000,
  });
  await expect.poll(() => markIds(peer), { timeout: 30_000 }).toEqual([carried]);
  await expect.poll(() => markIds(page), { timeout: 30_000 }).toEqual([carried]);
  // A replacement ends the steps before it.
  await expect(undo(peer)).toHaveAttribute('aria-disabled', 'true');
  await peer.screenshot({ path: test.info().outputPath('pdf-merge-carried.png') });

  // The same from a local copy left behind: marked offline, the tab closed, the file replaced, the tab opened.
  await link.cut();
  const kept = await highlight(peer, 2, 110);
  await expect.poll(() => peer.evaluate(copiesKept, COPIES)).toBe(1);
  await peer.close();
  await replaceStoredFile(page, { origin, id, tabId, headers, from: secondKey, pages: 2 });
  await expect(page.locator(PAGE_ONE)).toHaveAttribute('data-pdf-file-marks', new RegExp(carried), {
    timeout: 30_000,
  });
  await expect(page.locator(MARKS)).toHaveCount(0);
  await link.restore();
  peer = await participant(ctx, code);
  await expect.poll(() => markIds(peer), { timeout: 30_000 }).toEqual([kept]);
  await expect.poll(() => markIds(page), { timeout: 30_000 }).toEqual([kept]);
  await expect.poll(() => peer.evaluate(copiesKept, COPIES)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('pdf-merge-left-copy.png') });

  expectNoPageErrors(pageErrors);
});
