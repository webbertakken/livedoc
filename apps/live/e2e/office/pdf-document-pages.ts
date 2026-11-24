import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';
import { PdfLiveChanges } from '@livedoc/pdf-documents';
import { expect } from '../fixtures';
import { officeMenuItem } from './office-menus';

// What the PDF document's end-to-end specs share: getting a PDF onto its surface, a second browser on it, and a
// drag across the fixture's line of text (`textPdf` of `@livedoc/pdf-documents/testing`).

export const READY = '[data-pdf-surface="ready"]';
export const PAGE_ONE = '[data-pdf-page="1"]';
// The fixture's line of text sits 72 points in and 720 up a US Letter page, 12 points tall.
const LETTER = { width: 612, height: 792 };
const LINE = { left: 72, middle: LETTER.height - 720 - 4 };

/** Turns Dark pages off where the person never set it (dark-pages.md "The setting"), so a spec of something else
 *  reads the pages as the file says in the dark scheme. Runs in the page: the preferences' own key. */
function keepPagesAsTheyAre(): void {
  const key = 'livedoc:user-preferences:v1';
  const prefs = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
  if (prefs.pdfDarkPages === undefined)
    localStorage.setItem(key, JSON.stringify({ ...prefs, pdfDarkPages: false }));
}

/**
 * Drops a PDF from the computer on the page, as a person drags a file onto the window. Dark pages is turned off
 * first, so the pages read as the file says, unless `asTheFileSays` is false, as the Dark pages spec asks.
 */
export async function dropPdf(
  page: Page,
  name: string,
  bytes: Uint8Array,
  { asTheFileSays = true }: { asTheFileSays?: boolean } = {},
): Promise<void> {
  if (asTheFileSays) await page.evaluate(keepPagesAsTheyAre);
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
  return joinOn(ctx, code);
}

/** A page of `ctx` on the document, through a share link. */
export async function joinOn(ctx: BrowserContext, code: string): Promise<Page> {
  await ctx.addInitScript(keepPagesAsTheyAre);
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

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * Asks the document's room to replace a PDF tab's stored file, as an editor's surface does, over a socket of the
 * page's own: answers once the room has told this socket of the replacement, or of its refusal.
 */
export function askReplacement(
  page: Page,
  where: { url: string; asking: Record<string, unknown> },
): Promise<unknown> {
  return page.evaluate(
    ({ url, asking }) =>
      new Promise<unknown>((resolve, reject) => {
        const socket = new WebSocket(url);
        const giveUp = setTimeout(() => reject(new Error('the room did not answer')), 20_000);
        socket.onopen = () => {
          const participant = { id: 'replacer', name: 'Replacer', color: '#8ab4f8' };
          socket.send(JSON.stringify({ kind: 'hello', participant }));
          socket.send(JSON.stringify({ kind: 'op', op: asking, ref: 1 }));
        };
        socket.onmessage = ({ data }) => {
          const message = JSON.parse(String(data)) as { kind?: string; op?: { kind?: string } };
          const heard = message.kind === 'op' ? message.op?.kind : null;
          if (heard !== 'pdf-stored' && heard !== 'pdf-refused') return;
          clearTimeout(giveUp);
          socket.close();
          resolve(message.op);
        };
        socket.onerror = () => reject(new Error('the room refused the socket'));
      }),
    where,
  );
}

/** A socket to the document's room for the page's own session. */
export async function roomSocketUrl(
  page: Page,
  where: { origin: string; id: string; headers: Record<string, string> },
): Promise<string> {
  const { ticket } = (await (
    await page.request.post(`${apiBase}/documents/${where.id}/room-ticket`, {
      headers: where.headers,
    })
  ).json()) as { ticket: string };
  const base = where.origin.replace(/^http/, 'ws');
  return `${base}${apiBase}/documents/${where.id}/ws?t=${encodeURIComponent(ticket)}`;
}

/**
 * Replaces a PDF tab's stored file with the bake of what the room holds, as an Editor's idle surface does for the
 * budget: the page downloads its bake, stores it, and asks the room with the fingerprint of the live changes. Answers
 * the new stored file's key.
 */
export async function replaceStoredFile(
  page: Page,
  where: {
    origin: string;
    id: string;
    tabId: string;
    headers: Record<string, string>;
    from: string;
    pages: number;
  },
): Promise<string> {
  const { id, tabId, headers } = where;
  const downloadItem = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), downloadItem.click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-replaced-')), 'baked.pdf');
  await download.saveAs(file);
  const baked = readFileSync(file);
  const blob = sha256(baked);
  const put = await page.request.put(`${apiBase}/files/${blob}?document=${id}`, {
    headers: { ...headers, 'Content-Type': 'application/octet-stream' },
    data: baked,
  });
  expect(put.status()).toBe(201);
  const state = await page.request.get(`${apiBase}/documents/${id}/pdf-documents/${tabId}/state`, {
    headers,
  });
  expect(state.headers()['x-stored-file']).toBe(where.from);
  const held = PdfLiveChanges.load([new Uint8Array(await state.body())]);
  const asking = {
    kind: 'pdf-stored',
    tabId,
    from: where.from,
    blob,
    size: baked.length,
    pages: where.pages,
    reason: 'budget',
  };
  const told = await askReplacement(page, {
    url: await roomSocketUrl(page, where),
    asking: { ...asking, at: await PdfLiveChanges.fingerprint(held) },
  });
  expect(told).toEqual(asking);
  return blob;
}

/**
 * Two fingers drawn apart about a point of the window, as raw touches: Chromium's synthetic touch pinch does not zoom
 * a headless page, a zoomable one included (accessibility.md "Seeing"; reading-surface.md "Phone and tablet").
 */
export async function pinch(page: Page, at: { x: number; y: number }): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const fingers = (apart: number) => [
    { x: at.x - apart, y: at.y, id: 0 },
    { x: at.x + apart, y: at.y, id: 1 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(20) });
  for (let apart = 25; apart <= 150; apart += 5) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(apart) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** How far the browser has zoomed the page itself, 1 where it has not. */
export const pageScale = (page: Page): Promise<number> =>
  page.evaluate(() => window.visualViewport?.scale ?? 1);

/** A control as the tap-reach audit found it: its name and how far a finger reaches it, across and down, in px. */
export type TapReach = { name: string; across: number; down: number };

/**
 * How far a finger reaches every control showing outside the pages (touch-targets.md; reading-surface.md "Phone and
 * tablet"): from each one's middle, the run of points across and down that land on it, its touch pad included; past the
 * window's edge, a finger lands on what is at the edge. A control covered at its middle is skipped: it is not where
 * a finger can reach it now. A control a sideways-scrolling row holds partly out of view (the phone's toolbar) is
 * skipped too: it is reached once scrolled in, and the row's rounded end cuts it until then. A field inside its
 * label is reached through the label.
 */
export const tapReaches = (page: Page): Promise<TapReach[]> =>
  page.evaluate(() => {
    const CONTROLS =
      'button, a[href], input:not([type="checkbox"]):not([type="radio"]), select, label:has(input), [role="menuitem"], [role="menuitemcheckbox"], [role="treeitem"], [role="tab"], [role="option"]';
    const LIMIT = 40;
    const hits = (control: Element, x: number, y: number) => {
      const found = document.elementFromPoint(
        Math.min(Math.max(x, 0), window.innerWidth - 1),
        Math.min(Math.max(y, 0), window.innerHeight - 1),
      );
      return found !== null && (found === control || control.contains(found));
    };
    const run = (control: Element, x: number, y: number, dx: number, dy: number) => {
      let steps = 0;
      while (steps < LIMIT && hits(control, x + dx * (steps + 1), y + dy * (steps + 1))) steps += 1;
      return steps;
    };
    return [...document.querySelectorAll(CONTROLS)].flatMap((control) => {
      if (control.closest('[data-pdf-pages]')) return [];
      if (control.matches('label input')) return [];
      const box = control.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return [];
      const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
      if (!hits(control, x, y)) return [];
      const row = control.parentElement?.closest('[class*="overflow-x-auto"]');
      const view = row?.getBoundingClientRect();
      if (view && (box.left < view.left || box.right > view.right)) return [];
      // A row's rounded ends clip what passes under them as it scrolls: a control whose middle is within the curve is
      // part out of view, as one past the edge is.
      const curve =
        row && view
          ? Math.min(parseFloat(getComputedStyle(row).borderTopRightRadius) || 0, view.height / 2)
          : 0;
      if (view && (x - view.left < curve || view.right - x < curve)) return [];
      const name =
        control.getAttribute('aria-label') ??
        control.textContent?.trim().slice(0, 40) ??
        control.tagName;
      return [
        {
          name: `${control.tagName.toLowerCase()} ${name}`,
          across: run(control, x, y, -1, 0) + run(control, x, y, 1, 0) + 1,
          down: run(control, x, y, 0, -1) + run(control, x, y, 0, 1) + 1,
        },
      ];
    });
  });
