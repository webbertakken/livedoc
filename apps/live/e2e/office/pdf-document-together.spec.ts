import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PdfLiveChanges } from '@livedoc/pdf-documents';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import {
  askReplacement,
  dragAcrossFirstLine,
  dropPdf,
  PAGE_ONE,
  pageOneDrawn,
  peerOn,
  roomSocketUrl,
  sha256,
} from './pdf-document-pages';

// A PDF document worked on together (docs/specs/035-pdf-documents/editing-modes.md "Share roles";
// live-editing-and-storage.md "The room's op kinds", "Replacing the stored file"; docs/specs/006-document/
// blob-store.md "Holds and retention"): a Participant on a share link reviews it, the room storing what they mark;
// the stored file is replaced by its own bake in one step for both browsers, each opening the new file in place with
// the highlight now the file's own; the replaced file stays readable as a previous version; and a mark made after
// stands on the new file.

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

test('a Participant reviews a PDF, and its stored file is replaced in one step for everyone on it', async ({
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
  const stateUrl = `${apiBase}/documents/${id}/pdf-documents/${tabId}/state`;
  const firstKey = sha256(stored);

  // A Participant, through a share link: Reviewing is theirs (F7), so the tool that marks is offered.
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'participate' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;
  const peer = await peerOn(browser, baseURL!, code);
  const peerFirst = await pageOneDrawn(peer);
  await peer.getByRole('button', { name: 'Highlight', exact: true }).click();
  await expect(peer.locator('[data-pdf-tool="highlight"]')).toBeVisible();
  await dragAcrossFirstLine(peer, peerFirst);
  const made = peer.locator(`${PAGE_ONE} [data-pdf-mark]`);
  await expect(made).toHaveCount(1);
  const markId = (await made.getAttribute('data-pdf-mark'))!;

  // The room judged the Participant's change by what it touches, stored it, and relayed it to the Editor.
  await expect(page.locator(`${PAGE_ONE} [data-pdf-mark="${markId}"]`)).toHaveCount(1);
  await peer.screenshot({ path: test.info().outputPath('pdf-together-participant.png') });

  // The new stored file: the bake of what the room holds, as an Editor's surface makes it.
  const downloadItem = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), downloadItem.click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-together-')), 'baked.pdf');
  await download.saveAs(file);
  const baked = readFileSync(file);
  const bakedKey = sha256(baked);
  const put = await page.request.put(`${apiBase}/files/${bakedKey}?document=${id}`, {
    headers: { ...headers, 'Content-Type': 'application/octet-stream' },
    data: baked,
  });
  expect(put.status()).toBe(201);
  const state = await page.request.get(stateUrl, { headers });
  expect(state.headers()['x-stored-file']).toBe(firstKey);
  const held = PdfLiveChanges.load([new Uint8Array(await state.body())]);
  const socketUrl = await roomSocketUrl(page, { origin, id, headers });
  const asking = {
    kind: 'pdf-stored',
    tabId,
    from: firstKey,
    blob: bakedKey,
    size: baked.length,
    pages: 2,
    reason: 'budget',
  };

  // A file that lacks what the room holds is refused, and nothing changes.
  const stale = await PdfLiveChanges.fingerprint(PdfLiveChanges.load());
  expect(await askReplacement(page, { url: socketUrl, asking: { ...asking, at: stale } })).toEqual({
    kind: 'pdf-refused',
    tabId,
    name: 'live_changes_moved',
    replacement: true,
  });
  expect((await page.request.get(stateUrl, { headers })).headers()['x-stored-file']).toBe(firstKey);

  // Asked with the fingerprint of what the room holds, it is made the stored file, in one step.
  const told = await askReplacement(page, {
    url: await roomSocketUrl(page, { origin, id, headers }),
    asking: { ...asking, at: await PdfLiveChanges.fingerprint(held) },
  });
  expect(told).toEqual(asking);

  // Both browsers open the new file in place: the highlight is the file's own now, and no live mark is left.
  for (const surface of [page, peer]) {
    await expect(surface.locator(PAGE_ONE)).toHaveAttribute('data-pdf-file-marks', markId, {
      timeout: 30_000,
    });
    await expect(surface.locator('[data-pdf-mark]')).toHaveCount(0);
    await expect(surface.locator('[data-pdf-surface="ready"]')).toBeVisible();
  }
  await page.screenshot({ path: test.info().outputPath('pdf-together-replaced.png') });

  // The tab names the new file, its live changes are emptied, and the replaced file stays readable.
  const after = await page.request.get(stateUrl, { headers });
  expect(after.headers()['x-stored-file']).toBe(bakedKey);
  const emptied = PdfLiveChanges.load([new Uint8Array(await after.body())]);
  expect(PdfLiveChanges.isEmpty(emptied)).toBe(true);
  expect(PdfLiveChanges.stored(emptied)).toEqual({ blob: bakedKey, pages: 2 });
  const tab = (await (
    await page.request.get(`${apiBase}/documents/${id}/tabs/${tabId}`, { headers })
  ).json()) as { tab: { blob: string; size: number } };
  expect([tab.tab.blob, tab.tab.size]).toEqual([bakedKey, baked.length]);
  const previous = await page.request.get(`${apiBase}/documents/${id}/files/${firstKey}`, {
    headers,
  });
  expect(sha256(await previous.body())).toBe(firstKey);

  // A mark made after stands on the new file, and reaches the other browser as before.
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await dragAcrossFirstLine(page, await pageOneDrawn(page), { from: 150, to: 230 });
  const later = page.locator(`${PAGE_ONE} [data-pdf-mark]`);
  await expect(later).toHaveCount(1);
  const laterId = (await later.getAttribute('data-pdf-mark'))!;
  await expect(peer.locator(`${PAGE_ONE} [data-pdf-mark="${laterId}"]`)).toHaveCount(1);
  await peer.screenshot({ path: test.info().outputPath('pdf-together-after.png') });

  expectNoPageErrors(pageErrors);
});
