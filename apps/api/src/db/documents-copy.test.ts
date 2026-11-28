import { describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../test-sqlite-d1';
import { remapTabDataLinks } from '../document-room/document-content';
import { copyDocument } from './documents';
import { upsertTab } from './tabs';
import { Body, LiveThreads, TextDocumentState, ViewerCopy } from '@livedoc/text-documents';
import { appendLiveTabUpdate, readLiveTabState } from '../live-tabs/live-tab-store';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';

// copyDocument re-points a copied tab's internal links at the copy's own tabs.
describe('remapTabDataLinks', () => {
  const map = new Map([['t1', 'T1']]);

  it('rewrites tab and element links to the copy tab ids', () => {
    const data = JSON.stringify({
      elements: [
        { id: 'a', type: 'shape', link: { kind: 'tab', tabId: 't1' } },
        { id: 'b', type: 'shape', link: { kind: 'element', tabId: 't1', elementId: 'a' } },
        { id: 'c', type: 'shape', link: { kind: 'document', documentId: 'd', name: 'D' } },
      ],
      background: 'dots',
    });
    const out = JSON.parse(remapTabDataLinks(data, map)) as {
      background: string;
      elements: { link: unknown }[];
    };
    expect(out.background).toBe('dots');
    expect(out.elements.map((e) => e.link)).toEqual([
      { kind: 'tab', tabId: 'T1' },
      { kind: 'element', tabId: 'T1', elementId: 'a' },
      { kind: 'document', documentId: 'd', name: 'D' },
    ]);
  });

  // docs/specs/009-elements/tab-window.md: a copy's windows show the copy's tabs.
  it("re-points a Tab Window's tab, with no link anywhere on the tab", () => {
    const data = JSON.stringify({
      elements: [{ id: 'w', type: 'shape', shape: 'tab-window', windowTabId: 't1' }],
    });
    expect(JSON.parse(remapTabDataLinks(data, map))).toHaveProperty(
      ['elements', 0, 'windowTabId'],
      'T1',
    );
  });

  it('copies link-free and unparseable data byte for byte', () => {
    const plain = '{"elements":[{"id":"a","type":"shape"}]}';
    expect(remapTabDataLinks(plain, map)).toBe(plain);
    expect(remapTabDataLinks('{"tabId" nope', map)).toBe('{"tabId" nope');
  });
});

// docs/specs/013-workspace/tab-scoped-share-links.md: a tab-scoped visitor's copy holds their tab only.
// The copy moves content from the source's room into the copy's (docs/specs/006-document/document-storage.md
// "Routing", Copy): every tab under a fresh id, or a tab-scoped visitor's one tab.
describe('copyDocument', () => {
  async function source() {
    const db = sqliteD1();
    db.sql.exec(`INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at)
      VALUES ('d1', 'o', 'Doc', 0, 1, 1)`);
    await upsertTab(db.env, 'd1', { id: 't1', name: 'One', elements: [] }, 0);
    await upsertTab(
      db.env,
      'd1',
      {
        id: 't2',
        name: 'Two',
        elements: [{ id: 'a', type: 'shape', link: { kind: 'tab', tabId: 't1' } }],
      } as never,
      1,
    );
    return db;
  }
  const tabsOf = (db: ReturnType<typeof sqliteD1>, id: string) =>
    db.sql
      .prepare(
        'SELECT t.id, t.name, t.data FROM document_tabs dt JOIN tabs t ON t.id = dt.tab_id WHERE dt.document_id = ? ORDER BY dt.order_index',
      )
      .all(id) as { id: string; name: string; data: string }[];

  it('copies every tab under a fresh id, its links re-pointed, with the first summary', async () => {
    const db = await source();
    const copy = await copyDocument(db.env, 'd1', 'd2', 'me', 'Copy');
    expect(copy?.tabs.map((t) => t.name)).toEqual(['One', 'Two']);
    const [one, two] = tabsOf(db, 'd2');
    expect(one!.id).not.toBe('t1');
    const linked = JSON.parse(two!.data) as { elements: { link: { tabId: string } }[] };
    expect(linked.elements[0]!.link.tabId).toBe(one!.id);
    const row = db.sql.prepare("SELECT content_summary FROM documents WHERE id = 'd2'").get() as {
      content_summary: string;
    };
    expect(JSON.parse(row.content_summary)).toMatchObject({ v: 1, tabs: 2 });
  });

  it("copies a tab-scoped visitor's one tab", async () => {
    const db = await source();
    const copy = await copyDocument(db.env, 'd1', 'd2', 'me', 'Copy', 't2');
    expect(copy?.tabs.map((t) => t.name)).toEqual(['Two']);
    expect(await copyDocument(db.env, 'd1', 'd3', 'me', 'Copy', 'nope')).toBeNull();
  });

  // docs/specs/034-text-documents/live-editing-and-storage.md "Copies": a text document's state comes with its tab.
  it("copies a text document's writing under the tab's new id", async () => {
    const db = await source();
    await upsertTab(
      db.env,
      'd1',
      { id: 't3', name: 'Notes', kind: 'text-document', format: 'odf', elements: [] } as never,
      2,
    );
    await appendLiveTabUpdate(
      db.env,
      TEXT_DOCUMENT_LIVE_TAB,
      't3',
      TextDocumentState.fromBody(Body.of('Kept in the copy')),
    );
    await copyDocument(db.env, 'd1', 'd2', 'me', 'Copy');
    const copied = tabsOf(db, 'd2').find((t) => t.name === 'Notes')!;
    expect(copied.id).not.toBe('t3');
    const state = await readLiveTabState(db.env, TEXT_DOCUMENT_LIVE_TAB, copied.id);
    expect(TextDocumentState.paragraphs(TextDocumentState.load([state]))).toEqual(
      Body.of('Kept in the copy'),
    );
  });

  // review.md "What a Viewer receives": a Viewer's copy takes a text document without comments or authors.
  it('copies a text document as a Viewer may hold it, for a Viewer', async () => {
    const db = await source();
    await upsertTab(
      db.env,
      'd1',
      { id: 't3', name: 'Notes', kind: 'text-document', format: 'odf', elements: [] } as never,
      2,
    );
    const doc = TextDocumentState.load([TextDocumentState.fromBody(Body.of('Kept in the copy'))]);
    LiveThreads.begin(
      doc,
      {
        id: 'thread-1',
        tab: 't.0',
        ...LiveThreads.anchorFor(TextDocumentState.body(doc), 0, 1),
        quote: 'Kept',
        comment: {
          id: 'c1',
          text: 'Confidential remark',
          at: 1,
          author: { key: 'k-ada', name: 'Ada Secretname', colour: '#123456' },
        },
      },
      'test',
    );
    await appendLiveTabUpdate(db.env, TEXT_DOCUMENT_LIVE_TAB, 't3', TextDocumentState.encode(doc));
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await copyDocument(db.env, 'd1', 'd2', 'me', 'Copy', null, 'me', true);
    const copied = tabsOf(db, 'd2').find((t) => t.name === 'Notes')!;
    const state = await readLiveTabState(db.env, TEXT_DOCUMENT_LIVE_TAB, copied.id);
    const bytes = new TextDecoder('latin1').decode(state);
    for (const leak of ['Confidential', 'Ada Secretname', 'k-ada'])
      expect(bytes).not.toContain(leak);
    expect(TextDocumentState.paragraphs(TextDocumentState.load([state]))).toEqual(
      Body.of('Kept in the copy'),
    );
    vi.restoreAllMocks();
  });

  // files-and-print.md "Make a copy": the copy goes into the copier's own folder, never another's.
  it("files the copy in the copier's own folder, and at the root for anyone else's", async () => {
    const db = await source();
    db.sql.exec(`INSERT INTO folders (id, owner_id, parent_id, name, created_at, updated_at)
      VALUES ('mine', 'me', NULL, 'Plans', 1, 1), ('theirs', 'o', NULL, 'Theirs', 1, 1)`);
    expect(
      (
        await copyDocument(db.env, 'd1', 'd2', 'me', 'Copy', null, null, false, {
          folderId: 'mine',
        })
      )?.folderId,
    ).toBe('mine');
    expect(
      (
        await copyDocument(db.env, 'd1', 'd3', 'me', 'Copy', null, null, false, {
          folderId: 'theirs',
        })
      )?.folderId,
    ).toBeNull();
  });

  // files-and-print.md "Make a copy": without Copy comments and suggestions, a text document's copy holds no thread.
  it('copies a text document without its threads when asked', async () => {
    const db = await source();
    await upsertTab(
      db.env,
      'd1',
      { id: 't3', name: 'Notes', kind: 'text-document', format: 'odf', elements: [] } as never,
      2,
    );
    const doc = TextDocumentState.load([TextDocumentState.fromBody(Body.of('Kept in the copy'))]);
    LiveThreads.begin(
      doc,
      {
        id: 'thread-1',
        tab: 't.0',
        ...LiveThreads.anchorFor(TextDocumentState.body(doc), 0, 1),
        quote: 'Kept',
        comment: {
          id: 'c1',
          text: 'A remark',
          at: 1,
          author: { key: 'k', name: 'Ada', colour: '#123456' },
        },
      },
      'test',
    );
    await appendLiveTabUpdate(db.env, TEXT_DOCUMENT_LIVE_TAB, 't3', TextDocumentState.encode(doc));
    await copyDocument(db.env, 'd1', 'd2', 'o', 'Copy', null, null, false, {
      review: { comments: false, resolved: false },
    });
    const copied = tabsOf(db, 'd2').find((t) => t.name === 'Notes')!;
    const state = await readLiveTabState(db.env, TEXT_DOCUMENT_LIVE_TAB, copied.id);
    expect(LiveThreads.read(TextDocumentState.load([state]))).toEqual([]);
    expect(TextDocumentState.paragraphs(TextDocumentState.load([state]))).toEqual(
      Body.of('Kept in the copy'),
    );
  });

  it("refuses a Viewer's copy whose text document cannot be copied so", async () => {
    const db = await source();
    await upsertTab(
      db.env,
      'd1',
      { id: 't3', name: 'Notes', kind: 'text-document', format: 'odf', elements: [] } as never,
      2,
    );
    await appendLiveTabUpdate(
      db.env,
      TEXT_DOCUMENT_LIVE_TAB,
      't3',
      TextDocumentState.fromBody(Body.of('x')),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(ViewerCopy, 'redacted').mockImplementationOnce(() => {
      throw new Error('broken');
    });
    await expect(copyDocument(db.env, 'd1', 'd2', 'me', 'Copy', null, 'me', true)).rejects.toThrow(
      'viewer_copy_unavailable',
    );
    vi.restoreAllMocks();
  });

  it('takes the new row back when the import fails, leaving the source whole', async () => {
    const db = await source();
    const ns = db.env.DOCUMENT_ROOM;
    const get = ns.get.bind(ns);
    vi.spyOn(ns, 'get').mockImplementation((id) => {
      const room = get(id);
      if (String(id) !== 'd2') return room;
      return new Proxy(room, {
        get: (target, prop): unknown =>
          prop === 'importCopy'
            ? () => Promise.reject(new Error('room down'))
            : Reflect.get(target, prop),
      });
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(copyDocument(db.env, 'd1', 'd2', 'me', 'Copy')).rejects.toThrow('room down');
    expect(db.sql.prepare("SELECT id FROM documents WHERE id = 'd2'").get()).toBeUndefined();
    expect(tabsOf(db, 'd1')).toHaveLength(2);
  });
});
