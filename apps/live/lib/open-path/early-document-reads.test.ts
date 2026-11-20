// @vitest-environment jsdom
// docs/specs/016-platform/web-performance.md "The open path asks in parallel": "Asked while the editor's code
// downloads". What the early path asks, in what order, and as whom: always the requests the editor would make.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { guest, offline, identity, kinds, canvas } = vi.hoisted(() => ({
  kinds: { loadKindFamiliesFor: vi.fn(async (_tab: unknown, _reason: string) => {}) },
  canvas: { loadCanvasCode: vi.fn(async (_reason: string) => true) },
  guest: { ensureSignedGuestIdentity: vi.fn(async () => ({ id: 'g1', sig: 'sig1' })) },
  offline: { isOfflineId: vi.fn(async (_id: string) => false) },
  identity: { getGuestSelfSig: vi.fn((): string | null => 'sig1') },
}));
vi.mock('@/lib/guest-identity', () => guest);
vi.mock('@/lib/offline/offline-ids', () => offline);
vi.mock('@/lib/local-identity', () => identity);
vi.mock('@/lib/element-kinds/load-for', () => kinds);
vi.mock('@/lib/canvas-code/canvas-code', () => canvas);

import { askEarlyDocumentReads } from './early-document-reads';
import { openEarlyReads, resetEarlyReadsForTests, takeEarlyRead } from '@/lib/api/early-reads';
import { shareRead, documentRead, tabRead } from '@/lib/api/open-path-requests';
import {
  getSessionSharePassword,
  setSessionSharePassword,
  setTokenProvider,
  writeCachedShareGrant,
} from '@/lib/api/core';

const ORIGIN = 'https://docs.nu';
const GRANT = `spg_${'a'.repeat(43)}`;
const doc = (ownerId: string, tabs = [{ id: 't1' }, { id: 't2' }]) => ({
  id: 'd1',
  ownerId,
  name: 'Board',
  tabs,
});

type Route = Record<string, () => Response>;
let asked: { path: string; headers: Record<string, string> }[] = [];

function serve(routes: Route) {
  asked = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, ORIGIN).pathname;
      asked.push({ path, headers: Object.fromEntries(new Headers(init?.headers)) });
      const route = routes[path];
      return route ? route() : new Response('{}', { status: 404 });
    }),
  );
}
const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status });

// Whether the editor's own request would take an early answer.
async function editorWouldTake(read: Promise<{ url: string; headers: HeadersInit }>) {
  const { url, headers } = await read;
  return takeEarlyRead(url, { headers }) !== null;
}

beforeEach(() => {
  resetEarlyReadsForTests();
  openEarlyReads();
  setTokenProvider(null);
  setSessionSharePassword(null);
  localStorage.clear();
  guest.ensureSignedGuestIdentity.mockClear();
  kinds.loadKindFamiliesFor.mockClear();
  canvas.loadCanvasCode.mockClear();
  offline.isOfflineId.mockResolvedValue(false);
});
afterEach(() => vi.unstubAllGlobals());

describe('askEarlyDocumentReads', () => {
  // "The open is one read": the link's open read carries its first tab and the visitor's own row.
  it('asks a share link as one open read, as the guest the editor would be', async () => {
    serve({
      '/api/share/c1': json({
        document: doc('owner'),
        role: 'participate',
        tabId: null,
        openedTab: { id: 't1' },
        reader: null,
      }),
    });

    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/shared?s=c1` });

    expect(asked.map((a) => a.path)).toEqual(['/api/share/c1']);
    expect(asked[0]!.headers['x-document-open']).toBe('1');
    expect(guest.ensureSignedGuestIdentity).toHaveBeenCalledTimes(1);
    expect(await editorWouldTake(shareRead('c1', 'g1', { open: true }))).toBe(true);
  });

  it('asks the link and then its first tab when the open read carries none (an api from before)', async () => {
    serve({
      '/api/share/c1': json({ document: doc('owner'), role: 'participate', tabId: null }),
      '/api/documents/d1/tabs/t1': json({ tab: { id: 't1' } }),
    });

    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/shared?s=c1` });

    expect(asked.map((a) => a.path)).toEqual(['/api/share/c1', '/api/documents/d1/tabs/t1']);
    expect(await editorWouldTake(tabRead('g1', 'd1', 't1', 'c1', { open: true }))).toBe(true);
  });

  it('presents no share code on the tab when the reader owns the linked document', async () => {
    serve({
      '/api/share/c1': json({ document: doc('g1'), role: 'view', tabId: null }),
      '/api/documents/d1/tabs/t1': json({ tab: { id: 't1' } }),
    });

    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/shared?s=c1` });

    expect(await editorWouldTake(tabRead('g1', 'd1', 't1', null, { open: true }))).toBe(true);
  });

  it('asks the scoped tab of a tab-scoped link', async () => {
    serve({ '/api/share/c1': json({ document: doc('owner'), role: 'view', tabId: 't2' }) });

    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/shared?s=c1` });

    expect(asked.at(-1)!.path).toBe('/api/documents/d1/tabs/t2');
  });

  it('sends the cached grant with the link, as the editor would', async () => {
    writeCachedShareGrant('c1', GRANT);
    serve({ '/api/share/c1': json({ document: doc('owner'), role: 'view', tabId: null }) });

    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/shared?s=c1` });

    expect(asked.find((a) => a.path === '/api/share/c1')!.headers['x-share-password']).toBe(GRANT);
    expect(getSessionSharePassword()).toBe(GRANT);
    expect(await editorWouldTake(shareRead('c1', 'g1', { open: true }))).toBe(true);
  });

  it('asks no tab behind the password gate or a link that does not resolve', async () => {
    for (const answer of [json({ error: 'password_required' }, 401), json({}, 404)]) {
      resetEarlyReadsForTests();
      openEarlyReads();
      serve({ '/api/share/c1': answer });
      await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/shared?s=c1` });
      expect(asked.map((a) => a.path)).not.toContain('/api/documents/d1/tabs/t1');
    }
  });

  // "The open is one read": the document's open read carries its first tab and the reader's own row.
  it('asks an owner’s document as one open read, with their session token, never the guest header', async () => {
    setTokenProvider(async () => 'jwt-1');
    serve({
      '/api/documents/d1': json({ document: doc('acct_1'), openedTab: { id: 't1' }, reader: null }),
    });

    await askEarlyDocumentReads({ accountId: 'acct_1', href: `${ORIGIN}/document/d1#t=t2` });

    expect(guest.ensureSignedGuestIdentity).not.toHaveBeenCalled();
    expect(asked.map((a) => a.path)).toEqual(['/api/documents/d1']);
    expect(asked[0]!.headers['x-document-open']).toBe('1');
    expect(asked.every((a) => a.headers.authorization === 'Bearer jwt-1')).toBe(true);
    expect(asked.some((a) => 'x-owner-id' in a.headers)).toBe(false);
    expect(await editorWouldTake(documentRead('acct_1', 'd1', { open: true }))).toBe(true);
  });

  it('asks the first tab itself when the open read carries none (an api from before)', async () => {
    serve({
      '/api/documents/d1': json({ document: doc('g1') }),
      '/api/documents/d1/tabs/t1': json({ tab: { id: 't1' } }),
    });

    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/d1` });

    expect(asked.map((a) => a.path)).toEqual(['/api/documents/d1', '/api/documents/d1/tabs/t1']);
    expect(await editorWouldTake(tabRead('g1', 'd1', 't1', null, { open: true }))).toBe(true);
  });

  it('asks the server nothing about a document in This Browser', async () => {
    offline.isOfflineId.mockResolvedValue(true);
    serve({});

    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/local-1` });

    expect(asked).toEqual([]);
  });

  it('asks nothing at an address that names no document', async () => {
    serve({});

    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/placeholder` });

    expect(asked).toEqual([]);
    expect(guest.ensureSignedGuestIdentity).not.toHaveBeenCalled();
  });

  it('asks no tab of a document without tabs', async () => {
    serve({ '/api/documents/d1': json({ document: doc('g1', []) }) });

    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/d1` });

    expect(asked.map((a) => a.path)).toEqual(['/api/documents/d1']);
  });

  it('stops, and asks nothing more, once the editor has asked the link itself', async () => {
    serve({ '/api/share/c1': json({ document: doc('owner'), role: 'view', tabId: null }) });
    const { url, headers } = await shareRead('c1', 'g1', { open: true });
    void takeEarlyRead(url, { headers });

    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/shared?s=c1` });

    expect(asked).toEqual([]);
  });

  it('settles quietly when a signed-in reader has no token to ask with', async () => {
    serve({});

    await expect(
      askEarlyDocumentReads({ accountId: 'acct_1', href: `${ORIGIN}/document/d1` }),
    ).resolves.toBeUndefined();
  });
});

// "At the open": the families the opened tab's elements belong to load while the editor's code downloads.
describe('the opened tab’s element kind families', () => {
  const elements = [{ id: 'e1', type: 'shape', shape: 'reveal' }];

  it('start from the tab a share link’s open read carries', async () => {
    serve({
      '/api/share/c1': json({
        document: doc('owner'),
        role: 'participate',
        tabId: null,
        openedTab: { id: 't1', elements },
        reader: null,
      }),
    });
    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/shared?s=c1` });
    expect(kinds.loadKindFamiliesFor).toHaveBeenCalledWith({ id: 't1', elements }, 'open');
  });

  it('start from the tab an owner’s open read carries', async () => {
    serve({
      '/api/documents/d1': json({ document: doc('g1'), openedTab: { id: 't1', elements } }),
    });
    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/d1` });
    expect(kinds.loadKindFamiliesFor).toHaveBeenCalledWith({ id: 't1', elements }, 'open');
  });

  it('start from the first tab’s own read when the open read carries none', async () => {
    serve({
      '/api/documents/d1': json({ document: doc('g1') }),
      '/api/documents/d1/tabs/t1': json({ tab: { id: 't1', elements } }),
    });
    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/d1` });
    expect(kinds.loadKindFamiliesFor).toHaveBeenCalledWith({ id: 't1', elements }, 'open');
  });

  it('start nothing without a tab, or from a read that failed', async () => {
    serve({ '/api/documents/d1': json({ document: doc('g1'), openedTab: null }) });
    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/d1` });
    serve({ '/api/documents/d1': json({ document: doc('g1') }) });
    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/d1` });
    expect(kinds.loadKindFamiliesFor).not.toHaveBeenCalled();
  });
});

// docs/specs/006-document/kinds-outside-the-canvas.md "The canvas's code": asked at the open when the opened tab is a
// canvas, never when it has a surface.
describe('the canvas’s code at the open', () => {
  it('starts with a canvas tab the open read carries', async () => {
    serve({
      '/api/documents/d1': json({ document: doc('g1'), openedTab: { id: 't1', elements: [] } }),
    });
    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/d1` });
    expect(canvas.loadCanvasCode).toHaveBeenCalledWith('open');
  });

  it('starts with a canvas tab read on its own', async () => {
    serve({
      '/api/documents/d1': json({ document: doc('g1') }),
      '/api/documents/d1/tabs/t1': json({ tab: { id: 't1', elements: [] } }),
    });
    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/d1` });
    expect(canvas.loadCanvasCode).toHaveBeenCalledWith('open');
  });

  it('is not asked for a text document tab', async () => {
    serve({
      '/api/documents/d1': json({
        document: doc('g1'),
        openedTab: { id: 't1', kind: 'text-document', format: 'odf', elements: [] },
      }),
    });
    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/d1` });
    expect(canvas.loadCanvasCode).not.toHaveBeenCalled();
  });

  it('is not asked for a spreadsheet’s sheet tab, through a share link too', async () => {
    serve({
      '/api/share/c1': json({
        document: { ...doc('owner'), workbook: { id: 'w1' } },
        role: 'participate',
        tabId: null,
        openedTab: { id: 't1', kind: 'sheet', elements: [] },
        reader: null,
      }),
    });
    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/shared?s=c1` });
    expect(canvas.loadCanvasCode).not.toHaveBeenCalled();
  });

  it('is asked for a Plan Sheet, a sheet tab without a workbook', async () => {
    serve({
      '/api/documents/d1': json({
        document: doc('g1'),
        openedTab: { id: 't1', kind: 'sheet', elements: [] },
      }),
    });
    await askEarlyDocumentReads({ accountId: null, href: `${ORIGIN}/document/d1` });
    expect(canvas.loadCanvasCode).toHaveBeenCalledWith('open');
  });
});
