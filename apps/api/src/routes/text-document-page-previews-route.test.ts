import { beforeEach, describe, expect, it } from 'vitest';
import type { TextDocumentPagePreviewsResponse } from '@livedoc/api-schema';
import { TextDocumentState } from '@livedoc/text-documents';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { createShareLink } from '../db/share';
import { appendLiveTabUpdate } from '../live-tabs/live-tab-store';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { handleDocuments } from './documents';
import { parsePages } from './text-document-page-previews-route';
import { makeTestRouteContext } from './test-route-context';

// docs/specs/034-text-documents/agents-and-sync.md "Page previews": a text document's pages as SVG, through the tab's
// read gate and scope, labelled approximate.

let db: SqliteD1;

function previews(query: string, tab = 't1', code?: string) {
  return handleDocuments(
    makeTestRouteContext('GET', `/api/documents/D/tabs/${tab}/page-previews${query}`, {
      env: db.env,
      owner: code ? 'visitor' : 'owner',
      ...(code ? { headers: { 'X-Share-Code': code } } : {}),
    }),
  );
}

beforeEach(async () => {
  db = sqliteD1();
  const res = await handleDocuments(
    makeTestRouteContext('POST', '/api/documents', {
      env: db.env,
      owner: 'owner',
      body: {
        id: 'D',
        name: 'Report',
        tabs: [
          { id: 't1', kind: 'text-document', name: 'T', format: 'odf', elements: [] },
          { id: 't2', kind: 'diagram', name: 'C', elements: [] },
        ],
      },
    }),
  );
  expect(res.status).toBe(201);
  const doc = TextDocumentState.load();
  TextDocumentState.replaceBody(
    doc,
    Array.from({ length: 90 }, (_, n) => ({ text: `Paragraph ${n + 1} of the quarterly report` })),
  );
  await appendLiveTabUpdate(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1', TextDocumentState.encode(doc));
  await createShareLink(db.env, 'D', 'VIEWCODE', 'view');
  await createShareLink(db.env, 'D', 'SCOPED', 'edit', 'never', 't2');
});

describe('a text document’s page previews', () => {
  it('draws the first page by default, approximate, uncached', async () => {
    const res = await previews('');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json<TextDocumentPagePreviewsResponse>();
    expect(body.approximate).toBe(true);
    expect(body.pageCount).toBeGreaterThan(1);
    expect(body.pages.map((p) => p.number)).toEqual([1]);
    expect(body.pages[0]!.svg).toContain('>Paragraph 1 of the quarterly report<');
    expect(body.pages[0]!.svg).toContain('Approximate preview');
  });

  it('draws a range of pages, and a Viewer’s through their copy', async () => {
    const body = await (
      await previews('?pages=1..2', 't1', 'VIEWCODE')
    ).json<TextDocumentPagePreviewsResponse>();
    expect(body.pages.map((p) => p.number)).toEqual([1, 2]);
  });

  it('refuses a page past the end, a range past the cap, another kind and an unknown document tab', async () => {
    const past = await previews('?pages=40');
    expect(past.status).toBe(404);
    expect(await past.json()).toMatchObject({ error: 'page_not_found' });
    const wide = await previews('?pages=1..4');
    expect(wide.status).toBe(400);
    expect(await wide.json()).toMatchObject({ error: 'invalid_value' });
    const canvas = await previews('', 't2');
    expect(canvas.status).toBe(400);
    expect(await canvas.json()).toMatchObject({ error: 'not_a_text_document' });
    const only = await previews('?only=Nope');
    expect(only.status).toBe(400);
  });

  it('keeps a tab-scoped link on its own tab, and answers a missing document and tab', async () => {
    expect((await previews('', 't1', 'SCOPED')).status).toBe(404);
    expect((await previews('', 'nope')).status).toBe(404);
    const missing = await handleDocuments(
      makeTestRouteContext('GET', '/api/documents/X/tabs/t1/page-previews', {
        env: db.env,
        owner: 'owner',
      }),
    );
    expect(missing.status).toBe(404);
  });
});

describe('parsePages', () => {
  it('reads a page or a range of at most three, 1 by default', () => {
    expect(parsePages(null)).toEqual({ from: 1, to: 1 });
    expect(parsePages('2')).toEqual({ from: 2, to: 2 });
    expect(parsePages(' 2..4 ')).toEqual({ from: 2, to: 4 });
    for (const bad of ['0', 'x', '3..2', '1..2..3', '1.5'])
      expect(parsePages(bad)).toBe('pages takes a page number or a range, like 2 or 1..3');
    expect(parsePages('1..4')).toBe('pages takes at most 3 pages a call');
  });
});
