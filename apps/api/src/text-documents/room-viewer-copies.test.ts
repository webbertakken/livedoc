import { afterEach, describe, expect, it, vi } from 'vitest';
import { bytesOfBase64, LiveThreads, TextDocumentState, ViewerCopy } from '@livedoc/text-documents';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { makeTestRouteContext } from '../routes/test-route-context';
import { handleDocuments } from '../routes/documents';
import { appendLiveTabUpdate, storedUpdates } from '../live-tabs/live-tab-store';
import { TEXT_DOCUMENT_LIVE_TAB } from './text-document-live-tab';
import {
  parseViewerCopyRead,
  RoomViewerCopies,
  viewerStateOf,
  VIEWER_COPY_LIMITS,
  type ViewerCopyLimits,
  type ViewerCopyOp,
} from './room-viewer-copies';

// docs/specs/034-text-documents/review.md "What a Viewer receives"; live-editing-and-storage.md "A Viewer's copy":
// Viewers read a copy without threads or authors, made once, kept through hibernation, let go with the last Viewer.

const PLACE = { documentId: 'D', tabId: 't1' };
const ADA = { key: 'key-ada-77', name: 'Ada Secretname', colour: '#1a73e8' };
const SECRET = 'Confidential remark';
const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);
const LEAKS = [SECRET, ADA.name, ADA.key, 'thread-'];

/** A Yjs text of the browser's body, as its methods are reached without Yjs here. */
type TextLike = {
  insert: (at: number, text: string) => void;
  format: (at: number, length: number, attributes: object) => void;
  length: number;
};
const textOf = (doc: ReturnType<typeof TextDocumentState.load>, i: number): TextLike =>
  (TextDocumentState.body(doc).get(i) as unknown as { get: (n: number) => TextLike }).get(0);

async function room(limits: Partial<ViewerCopyLimits> = {}) {
  const db: SqliteD1 = sqliteD1();
  await handleDocuments(
    makeTestRouteContext('POST', '/api/documents', {
      env: db.env,
      owner: 'owner',
      body: {
        id: 'D',
        name: 'D',
        tabs: [{ id: 't1', name: 'T', kind: 'text-document', elements: [] }],
      },
    }),
  );
  const browser = TextDocumentState.load();
  browser.clientID = 515_151;
  let viewers = true;
  let ids = 0;
  const closeViewers = vi.fn(() => 2);
  const make = () =>
    new RoomViewerCopies({
      env: db.env,
      storedUpdates: (tabId) => storedUpdates(db.env, TEXT_DOCUMENT_LIVE_TAB, tabId),
      hasViewers: () => viewers,
      closeViewers,
      now: () => 1_000,
      newId: () => `copy-${(ids += 1)}`,
      limits: { ...VIEWER_COPY_LIMITS, ...limits },
    });
  /** One edit stored by the room, as it stores a socket's: the update, once in the log. */
  const store = async (change: () => void): Promise<Uint8Array> => {
    const before = TextDocumentState.stateVectorOf(TextDocumentState.encode(browser));
    browser.transact(change);
    const update = TextDocumentState.since(TextDocumentState.encode(browser), before);
    await appendLiveTabUpdate(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1', update);
    return update;
  };
  return {
    db,
    browser,
    make,
    store,
    closeViewers,
    setViewers: (on: boolean) => {
      viewers = on;
    },
    rows: async () =>
      (
        await db.env.DOCUMENT_DB.prepare(
          'SELECT COUNT(*) AS n FROM text_document_viewer_copy_updates',
        ).first<{ n: number }>()
      )?.n ?? 0,
  };
}

/** A paragraph of text added, suggested by Ada, with her thread on it. */
function writeSecrets(r: Awaited<ReturnType<typeof room>>, text = 'Hello') {
  return r.store(() => {
    const texts = TextDocumentState.paragraphs(r.browser)
      .map((p) => p.text)
      .filter((t) => t !== '');
    TextDocumentState.replaceBody(
      r.browser,
      [...texts, text].map((t) => ({ text: t })),
    );
    const last = texts.length;
    textOf(r.browser, last).format(0, text.length, {
      insertion: { id: `s-${text}`, at: 1, author: ADA },
    });
    LiveThreads.begin(
      r.browser,
      {
        id: `thread-${text}`,
        tab: 't.0',
        ...LiveThreads.anchorFor(TextDocumentState.body(r.browser), 0, 1),
        quote: text,
        comment: { id: `c-${text}`, text: SECRET, at: 1, author: ADA },
      },
      'test',
    );
  });
}

/** What a Viewer reads, from a state and the ops after it. */
const viewerText = (...updates: Uint8Array[]) =>
  TextDocumentState.paragraphs(TextDocumentState.load(updates)).map((p) => p.text);
afterEach(() => vi.restoreAllMocks());

describe('RoomViewerCopies', () => {
  it('answers a Viewer from a copy without threads or authors, made once and kept', async () => {
    const r = await room();
    await writeSecrets(r);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const copies = r.make();
    const read = await copies.state(PLACE);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.id).toBe('copy-1');
    expect(latin1(read.state)).toContain('Hello');
    for (const leak of LEAKS) expect(latin1(read.state), leak).not.toContain(leak);
    expect(info.mock.calls.flat().join('\n')).toMatch(
      /\[viewer-copy\] built document=D tab=t1 bytes=\d+ ms=\d+/,
    );
    // Asked again, the same copy.
    const again = await copies.state(PLACE);
    expect(again.ok && again.id).toBe('copy-1');
    expect(await r.rows()).toBe(1);
  });

  it('copies each stored update over for Viewers, nothing of a thread or author in it', async () => {
    const r = await room();
    await writeSecrets(r, 'One');
    const copies = r.make();
    const read = await copies.state(PLACE);
    if (!read.ok) throw new Error('no copy');
    const update = await writeSecrets(r, 'Two');
    await copies.ready(PLACE);
    const op = (await copies.relay(PLACE, update)) as Extract<ViewerCopyOp, { update: string }>;
    expect(op).toMatchObject({ kind: 'text-document', tabId: 't1', viewerCopy: 'copy-1' });
    const bytes = bytesOfBase64(op.update)!;
    for (const leak of LEAKS) expect(latin1(bytes), leak).not.toContain(leak);
    expect(viewerText(read.state, bytes)).toEqual(['One', 'Two']);
    expect(await r.rows()).toBe(2);
  });

  it('relays nothing for a tab no Viewer has read, and nothing for a change to a thread alone', async () => {
    const r = await room();
    await writeSecrets(r);
    const copies = r.make();
    const first = await writeSecrets(r, 'More');
    await copies.ready(PLACE);
    expect(await copies.relay(PLACE, first)).toBeNull();
    await copies.state(PLACE);
    const threadOnly = await r.store(() =>
      LiveThreads.resolve(r.browser, 'thread-Hello', true, 'test'),
    );
    expect(await copies.relay(PLACE, threadOnly)).toBeNull();
  });

  it('answers a catch-up from this copy with what it lacks, and refuses one from another copy', async () => {
    const r = await room();
    await writeSecrets(r, 'One');
    const copies = r.make();
    const read = await copies.state(PLACE);
    if (!read.ok) throw new Error('no copy');
    const update = await writeSecrets(r, 'Two');
    await copies.relay(PLACE, update);
    const since = await copies.state(PLACE, { vector: read.vector, copy: 'copy-1' });
    expect(since.ok && latin1(since.state)).toContain('Two');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await copies.state(PLACE, { vector: read.vector, copy: 'copy-0' })).toEqual({
      ok: false,
      error: 'viewer_copy_changed',
    });
    expect(await copies.state(PLACE, { vector: read.vector, copy: null })).toMatchObject({
      ok: false,
    });
    expect(warn.mock.calls.flat().join('\n')).toContain(
      '[viewer-copy] refused document=D tab=t1 since=another-copy',
    );
  });

  it('takes the same copy up again after the room hibernates, under its own client', async () => {
    const r = await room();
    await writeSecrets(r, 'One');
    const before = r.make();
    const read = await before.state(PLACE);
    if (!read.ok) throw new Error('no copy');
    // The room wakes with nothing in memory; the next stored update finds the kept copy first.
    const woken = r.make();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await woken.ready(PLACE);
    const update = await writeSecrets(r, 'Two');
    const op = (await woken.relay(PLACE, update)) as Extract<ViewerCopyOp, { update: string }>;
    expect(op.viewerCopy).toBe('copy-1');
    expect(viewerText(read.state, bytesOfBase64(op.update)!)).toEqual(['One', 'Two']);
    expect(info.mock.calls.flat().join('\n')).toMatch(
      /\[viewer-copy\] restored document=D tab=t1 updates=1 caught-up=false/,
    );
    expect(r.closeViewers).not.toHaveBeenCalled();
    // A Viewer's catch-up names the same copy.
    expect((await woken.state(PLACE, { vector: read.vector, copy: 'copy-1' })).ok).toBe(true);
  });

  it('makes nothing before a stored update when no Viewer is connected', async () => {
    const r = await room();
    await writeSecrets(r);
    await r.make().state(PLACE);
    r.setViewers(false);
    const woken = r.make();
    await woken.ready(PLACE);
    expect(await woken.relay(PLACE, await writeSecrets(r, 'Two'))).toBeNull();
  });

  it('closes Viewers when a kept copy lagged the state, after catching it up', async () => {
    const r = await room();
    await writeSecrets(r, 'One');
    await r.make().state(PLACE);
    // Stored, but the room stopped before copying it over.
    await r.store(() => textOf(r.browser, 0).insert(3, ' more'));
    const woken = r.make();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const read = await woken.state(PLACE);
    expect(read.ok && read.id).toBe('copy-1');
    expect(r.closeViewers).toHaveBeenCalledTimes(1);
    expect(await r.rows()).toBe(2);
  });

  it('lets a kept copy go that no longer lines up, closing Viewers, and makes a new one', async () => {
    const r = await room();
    await writeSecrets(r, 'One');
    await r.make().state(PLACE);
    // Stored behind the copy's back: a paragraph the kept copy has no twin for.
    await writeSecrets(r, 'Two');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    // A Viewer's read makes a new one at once.
    const read = await r.make().state(PLACE);
    expect(read.ok && read.id).toBe('copy-2');
    expect(r.closeViewers).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.flat().join('\n')).toMatch(
      /\[viewer-copy\] dropped document=D tab=t1 reason=failed closed=2 restore/,
    );
    // Before a stored update, one is taken up or none is made.
    await writeSecrets(r, 'Three');
    const woken = r.make();
    await woken.ready(PLACE);
    expect(r.closeViewers).toHaveBeenCalledTimes(2);
    expect(await woken.relay(PLACE, await writeSecrets(r, 'Four'))).toBeNull();
  });

  it('lets every copy go with the last Viewer, and none is taken up after', async () => {
    const r = await room();
    await writeSecrets(r);
    const copies = r.make();
    await copies.state(PLACE);
    await copies.dropIdle('D');
    expect(await r.rows()).toBe(1);
    r.setViewers(false);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await copies.dropIdle('D');
    expect(await r.rows()).toBe(0);
    expect(info.mock.calls.flat().join('\n')).toContain(
      '[viewer-copy] dropped document=D tabs=1 reason=idle',
    );
    expect(await copies.relay(PLACE, await writeSecrets(r, 'Two'))).toBeNull();
    r.setViewers(true);
    const woken = r.make();
    await woken.ready(PLACE);
    expect(await woken.relay(PLACE, await writeSecrets(r, 'Three'))).toBeNull();
  });

  it('logs and goes on when the rows cannot be dropped', async () => {
    const r = await room();
    r.setViewers(false);
    const copies = r.make();
    vi.spyOn(r.db.env.DOCUMENT_DB, 'batch').mockRejectedValueOnce(new Error('disk'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await copies.dropIdle(null);
    expect(warn.mock.calls.flat().join('\n')).toContain(
      '[viewer-copy] failed document=- reason=drop error=Error: disk',
    );
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await copies.dropIdle(null);
    expect(info.mock.calls.flat().join('\n')).toContain('[viewer-copy] dropped document=- tabs=0');
  });

  it('refuses a copy of a state past its limits, before or after it is made', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const big = await room({ sourceMaxBytes: 10 });
    await writeSecrets(big);
    expect(await big.make().state(PLACE)).toEqual({
      ok: false,
      error: 'viewer_copy_unavailable',
    });
    const wide = await room({ stateMaxBytes: 10 });
    await writeSecrets(wide);
    expect((await wide.make().state(PLACE)).ok).toBe(false);
    expect(warn.mock.calls.flat().join('\n')).toMatch(/reason=too-large source=\d+/);
    expect(warn.mock.calls.flat().join('\n')).toMatch(/reason=too-large state=\d+/);
  });

  it('lets a kept copy go when its state has grown past its limit since', async () => {
    const r = await room();
    await writeSecrets(r);
    await r.make().state(PLACE);
    await writeSecrets(r, 'Two');
    const strict = new RoomViewerCopies({
      env: r.db.env,
      storedUpdates: () => Promise.resolve([new Uint8Array(64)]),
      hasViewers: () => true,
      closeViewers: r.closeViewers,
      limits: { ...VIEWER_COPY_LIMITS, sourceMaxBytes: 8 },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await strict.ready(PLACE);
    expect(r.closeViewers).toHaveBeenCalledTimes(1);
    expect(await r.rows()).toBe(0);
  });

  it('answers unavailable when the state cannot be read or copied, or the copy kept', async () => {
    const r = await room();
    await writeSecrets(r);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unreadable = new RoomViewerCopies({
      env: r.db.env,
      storedUpdates: () => Promise.reject(new Error('gone')),
      hasViewers: () => true,
      closeViewers: r.closeViewers,
    });
    expect((await unreadable.state(PLACE)).ok).toBe(false);
    vi.spyOn(ViewerCopy, 'build').mockImplementationOnce(() => {
      throw new Error('broken');
    });
    expect((await r.make().state(PLACE)).ok).toBe(false);
    const batch = r.db.env.DOCUMENT_DB.batch.bind(r.db.env.DOCUMENT_DB);
    vi.spyOn(r.db.env.DOCUMENT_DB, 'batch')
      // The stored state read; the copy's rows refused.
      .mockImplementationOnce(batch)
      .mockRejectedValueOnce(new Error('full'));
    expect((await r.make().state(PLACE)).ok).toBe(false);
    vi.spyOn(r.db.env.DOCUMENT_DB, 'batch').mockRejectedValueOnce(new Error('locked'));
    expect((await r.make().state(PLACE)).ok).toBe(false);
    const log = warn.mock.calls.flat().join('\n');
    expect(log).toContain('reason=read Error: gone');
    expect(log).toContain('reason=build Error: broken');
    expect(log).toContain('reason=keep Error: full');
    expect(log).toContain('reason=read Error: locked');
  });

  it('lets a copy go, closing Viewers, when an update cannot be copied over', async () => {
    const r = await room();
    await writeSecrets(r);
    const copies = r.make();
    await copies.state(PLACE);
    vi.spyOn(ViewerCopy.prototype, 'apply').mockImplementationOnce(() => {
      throw new Error('torn');
    });
    vi.spyOn(r.db.env.DOCUMENT_DB, 'batch').mockRejectedValueOnce(new Error('jammed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await copies.relay(PLACE, await writeSecrets(r, 'Two'))).toBeNull();
    expect(r.closeViewers).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.flat().join('\n')).toMatch(/reason=failed closed=2 Error: torn/);
    expect(warn.mock.calls.flat().join('\n')).toContain('reason=drop error=Error: jammed');
  });

  it('compacts the kept log into one row, and lets a copy grown too large go', async () => {
    const r = await room({ logUpdates: 2 });
    await writeSecrets(r);
    const copies = r.make();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await copies.state(PLACE);
    await copies.relay(PLACE, await writeSecrets(r, 'Two'));
    expect(await r.rows()).toBe(2);
    await copies.relay(PLACE, await writeSecrets(r, 'Three'));
    expect(await r.rows()).toBe(1);
    expect(info.mock.calls.flat().join('\n')).toMatch(
      /\[viewer-copy\] compacted document=D tab=t1 bytes=\d+/,
    );
    // Taken up again from the compacted row.
    const woken = r.make();
    await woken.ready(PLACE);
    const op = await woken.relay(PLACE, await writeSecrets(r, 'Four'));
    expect(op).toMatchObject({ viewerCopy: 'copy-1' });

    const tight = await room({ logUpdates: 1, stateMaxBytes: 400 });
    await writeSecrets(tight);
    const small = tight.make();
    await small.state(PLACE);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await small.relay(PLACE, await writeSecrets(tight, 'x'.repeat(500)))).toBeNull();
    expect(tight.closeViewers).toHaveBeenCalledTimes(1);
  });

  it('sends the tab stale in place of a gain too large for a frame', async () => {
    const r = await room({ frameChars: 8 });
    await writeSecrets(r);
    const copies = r.make();
    await copies.state(PLACE);
    expect(await copies.relay(PLACE, await writeSecrets(r, 'Two'))).toEqual({
      kind: 'text-document',
      tabId: 't1',
      stale: true,
    });
  });
});

describe('RoomViewerCopies without a clock or ids of its own', () => {
  it('names a copy by a random id', async () => {
    const r = await room();
    await writeSecrets(r);
    const copies = new RoomViewerCopies({
      env: r.db.env,
      storedUpdates: (tabId) => storedUpdates(r.db.env, TEXT_DOCUMENT_LIVE_TAB, tabId),
      hasViewers: () => true,
      closeViewers: () => 0,
    });
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const read = await copies.state(PLACE);
    expect(read.ok && read.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('viewerStateOf', () => {
  it('copies a state once, without threads or authors, and refuses one past the limit', async () => {
    const r = await room();
    await writeSecrets(r);
    const [state] = await storedUpdates(r.db.env, TEXT_DOCUMENT_LIVE_TAB, 't1');
    const copied = viewerStateOf(state!, PLACE)!;
    expect(viewerText(copied)).toEqual(['Hello']);
    for (const leak of LEAKS) expect(latin1(copied), leak).not.toContain(leak);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(viewerStateOf(state!, PLACE, { ...VIEWER_COPY_LIMITS, sourceMaxBytes: 1 })).toBeNull();
    expect(warn.mock.calls.flat().join('\n')).toMatch(
      /\[viewer-copy\] failed document=D tab=t1 reason=too-large source=\d+/,
    );
  });
});

describe('parseViewerCopyRead', () => {
  it('reads a Viewer’s read, with or without what it holds', () => {
    expect(parseViewerCopyRead({ documentId: 'D', tabId: 't1' })).toEqual({ place: PLACE });
    expect(
      parseViewerCopyRead({ documentId: 'D', tabId: 't1', since: 'AA==', copy: 'c1' }),
    ).toEqual({ place: PLACE, reader: { vector: Uint8Array.of(0), copy: 'c1' } });
    expect(parseViewerCopyRead({ documentId: 'D', tabId: 't1', since: 'AA==' })).toEqual({
      place: PLACE,
      reader: { vector: Uint8Array.of(0), copy: null },
    });
    // A reader whose vector rides no URL names its copy alone.
    expect(parseViewerCopyRead({ documentId: 'D', tabId: 't1', copy: 'c1' })).toEqual({
      place: PLACE,
      reader: { copy: 'c1' },
    });
    expect(parseViewerCopyRead({ documentId: 'D', tabId: 't1', copy: 3 })).toEqual({
      place: PLACE,
      reader: { copy: null },
    });
  });

  it('refuses what is no read', () => {
    for (const body of [
      null,
      'x',
      { tabId: 't1' },
      { documentId: 'D', tabId: 1 },
      { documentId: 'D', tabId: 't1', since: 7 },
      { documentId: 'D', tabId: 't1', since: '***' },
    ])
      expect(parseViewerCopyRead(body)).toBeNull();
  });
});
