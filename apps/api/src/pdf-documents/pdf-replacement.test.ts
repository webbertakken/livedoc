// docs/specs/035-pdf-documents/live-editing-and-storage.md "Replacing the stored file"; the room's side is every
// live tab kind's (docs/specs/006-document/kinds-outside-the-canvas.md "Live state": "What a state stands on",
// "Replacing a state with its row").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_STORED_FILE_HEADER } from '@livedoc/api-schema';
import { blobKeyOf, FILE_PREVIOUS_VERSION_DAYS, type BlobKey } from '@livedoc/document';
import { Mark, PageName, PdfLiveChanges, type Quad } from '@livedoc/pdf-documents';
import { base64OfBytes } from '@livedoc/text-documents';
import { keepStoredFile, tabBlobHolds } from '../blob-store/tab-blobs';
import { testFilesBucket } from '../blob-store/test-files-bucket';
import { getTab } from '../db';
import { liveTabKindOfReplacement } from '../live-tabs/live-tab-kinds';
import { readLiveTabState, storedUpdates } from '../live-tabs/live-tab-store';
import { RoomLiveTabs } from '../live-tabs/room-live-tabs';
import { gateClientOp } from '../room-op-gate';
import { handleBlobStoreRoutes } from '../routes/blob-store-routes';
import { handleDocuments } from '../routes/documents';
import { makeTestRouteContext } from '../routes/test-route-context';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { documentBlobHold } from './pdf-document-store';
import { PDF_LIVE_TAB } from './pdf-live-tab';
import { previousStoredFiles, previousVersionHeldUntil } from './pdf-previous';
import { parsePdfStored } from './pdf-replacement';

const bytesOf = (text: string) => Uint8Array.from(new TextEncoder().encode(text));
const FIRST = bytesOf('%PDF-1.7\nthe file as it came\n%%EOF\n');
const SECOND = bytesOf('%PDF-1.7\nthe file as it came\n%%EOF\nwith one addition\n%%EOF\n');
const QUAD: Quad = [72, 730, 300, 730, 72, 716, 300, 716];
const DAY_MS = 86_400_000;
const ws = {} as WebSocket;

let db: SqliteD1;
let first: BlobKey;
let second: BlobKey;

async function store(bytes: Uint8Array<ArrayBuffer>, owner = 'ada'): Promise<BlobKey> {
  const key = await blobKeyOf(bytes);
  await handleBlobStoreRoutes(
    makeTestRouteContext('PUT', `/api/files/${key}`, {
      env: db.env,
      owner,
      rawBody: bytes as unknown as string,
      headers: { 'Content-Length': String(bytes.byteLength) },
    }),
  );
  return key;
}

function room(kind = PDF_LIVE_TAB) {
  const told: unknown[] = [];
  const everyone: { from: string; op: unknown }[] = [];
  const tabs = new RoomLiveTabs(kind, {
    env: db.env,
    enqueue: (step) => step(),
    sequence: (from, op) => everyone.push({ from, op }),
    sendTo: (_ws, payload) => void told.push(payload),
    position: () => ({ epoch: 'e' }),
  });
  return { tabs, told, everyone };
}

const editor = { ws, presenceId: 'p1', documentId: 'D', level: 'edit' as const };

/** One person's highlight on the stored file `on`, as the update their browser sends. */
function highlightUpdate(id: string, on: BlobKey): Uint8Array {
  const doc = PdfLiveChanges.load();
  PdfLiveChanges.setStored(doc, { blob: on, pages: 2 });
  PdfLiveChanges.addMark(
    doc,
    Mark.highlight({
      id,
      page: PageName.ofObject(4),
      quads: [QUAD],
      text: 'words',
      colour: '#fff3a3',
      opacity: 1,
      author: 'Ada',
      createdAt: 1_795_000_000_000,
    })!,
  );
  return PdfLiveChanges.encode(doc);
}

const frame = (update: Uint8Array, on: BlobKey) => ({
  kind: 'pdf',
  tabId: 't1',
  update: base64OfBytes(update),
  on,
});

/** The fingerprint of what the room holds for the tab: what a baker that has everything names. */
const heldFingerprint = async () =>
  PdfLiveChanges.fingerprint(PdfLiveChanges.load(await storedUpdates(db.env, PDF_LIVE_TAB, 't1')));

async function asking(over: Record<string, unknown> = {}) {
  return {
    kind: 'pdf-stored',
    tabId: 't1',
    from: first,
    blob: second,
    size: SECOND.byteLength,
    pages: 2,
    reason: 'budget',
    at: await heldFingerprint(),
    ...over,
  };
}

const refusedBy = (name: string) => ({
  kind: 'op',
  from: 'system',
  op: { kind: 'pdf-refused', tabId: 't1', name, replacement: true },
});

beforeEach(async () => {
  db = sqliteD1();
  db.env.FILES = testFilesBucket();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  first = await store(FIRST);
  second = await store(SECOND);
  const made = await handleDocuments(
    makeTestRouteContext('POST', '/api/documents', {
      env: db.env,
      owner: 'ada',
      body: {
        id: 'D',
        name: 'Contract',
        tabs: [
          {
            id: 't1',
            name: 'Contract',
            kind: 'pdf',
            elements: [],
            blob: first,
            size: FIRST.byteLength,
          },
          { id: 't2', name: 'Notes', kind: 'text-document', elements: [] },
        ],
      },
    }),
  );
  expect(made.status).toBe(201);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a replacement, as asked', () => {
  it('is read whole or not at all', async () => {
    const whole = await asking();
    expect(parsePdfStored(whole)).toEqual({ ...whole, kind: undefined });
    for (const broken of [
      null,
      'pdf-stored',
      { ...whole, kind: 'pdf' },
      { ...whole, tabId: 4 },
      { ...whole, from: 'abc' },
      { ...whole, blob: 'abc' },
      { ...whole, blob: first },
      { ...whole, at: 'abc' },
      { ...whole, size: 0 },
      { ...whole, size: 1.5 },
      { ...whole, size: 100_000_001 },
      { ...whole, pages: 0 },
      { ...whole, pages: '2' },
      { ...whole, reason: 'because' },
    ])
      expect(parsePdfStored(broken)).toBeNull();
  });

  it('is the PDF document’s to declare, and reaches the room from every level', async () => {
    expect(liveTabKindOfReplacement('pdf-stored')).toBe(PDF_LIVE_TAB);
    expect(liveTabKindOfReplacement('text-document')).toBeNull();
    for (const role of ['edit', 'participate', 'view'] as const)
      expect(gateClientOp(await asking(), { role, tabScope: null, key: undefined })).toEqual({
        kind: 'live-tab',
        level: role,
      });
    // A tab-scoped session keeps to its own tab.
    expect(
      gateClientOp(await asking(), { role: 'edit', tabScope: 'other', key: undefined }),
    ).toEqual({ kind: 'drop' });
  });

  // "Nor a PDF tab's stored file": only the room tells that patch.
  it.each(['blob', 'size'])('drops a client’s tab-meta that carries a tab’s %s', (field) => {
    const op = { kind: 'tab-meta', tabId: 't1', patch: { [field]: 1 } };
    expect(gateClientOp(op, { role: 'edit', tabScope: null, key: undefined })).toEqual({
      kind: 'drop',
    });
  });
});

describe('replacing the stored file', () => {
  it('swaps the tab’s file and its live changes in one step, keeping the old file as a previous version', async () => {
    const { tabs, told, everyone } = room();
    expect(await tabs.accept(editor, frame(highlightUpdate('m1', first), first))).toBe(true);
    const before = await getTab(db.env, 'D', 't1');
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ['Date'] });
    expect(await tabs.replace(editor, await asking(), 9)).toBe(true);

    const tab = await getTab(db.env, 'D', 't1');
    expect(tab).toMatchObject({
      kind: 'pdf',
      name: 'Contract',
      blob: second,
      size: SECOND.byteLength,
    });
    expect(tab!.rev).toBe(before!.rev + 1);
    // The live changes are emptied but for the new file's name and pages.
    const state = PdfLiveChanges.load([await readLiveTabState(db.env, PDF_LIVE_TAB, 't1')]);
    expect(PdfLiveChanges.stored(state)).toEqual({ blob: second, pages: 2 });
    expect(PdfLiveChanges.isEmpty(state)).toBe(true);
    expect(await previousStoredFiles(db.env, 't1')).toEqual([
      { blob: first, size: FIRST.byteLength, replacedAt: 1_800_000_000_000 },
    ]);
    // Everyone hears the row's change, then the replacement; the sender its own op's place.
    expect(everyone.slice(1)).toEqual([
      {
        from: 'system',
        op: { kind: 'tab-meta', tabId: 't1', patch: { blob: second, size: SECOND.byteLength } },
      },
      {
        from: 'system',
        op: {
          kind: 'pdf-stored',
          tabId: 't1',
          from: first,
          blob: second,
          size: SECOND.byteLength,
          pages: 2,
          reason: 'budget',
        },
      },
    ]);
    expect(told.at(-1)).toEqual({ kind: 'cursor', epoch: 'e', seq: 3, ref: 9 });
    expect(console.info).toHaveBeenCalledWith(
      `[pdf] stored-file-replaced reason=budget from=${first.slice(0, 8)} to=${second.slice(0, 8)} document=D tab=t1`,
    );
  });

  it.each([
    ['participate', 'level_too_low'],
    ['view', 'level_too_low'],
  ] as const)('refuses one asked at %s', async (level, name) => {
    const { tabs, told, everyone } = room();
    expect(await tabs.replace({ ...editor, level }, await asking())).toBe(false);
    expect(told).toEqual([refusedBy(name)]);
    expect(everyone).toEqual([]);
    expect((await getTab(db.env, 'D', 't1'))!.blob).toBe(first);
  });

  it('refuses one that replaces a file the tab no longer names', async () => {
    const { tabs, told } = room();
    const third = await store(bytesOf('%PDF-1.7\nanother\n%%EOF\n'));
    expect(await tabs.replace(editor, await asking({ from: third }))).toBe(false);
    expect(told).toEqual([refusedBy('stored_file_changed')]);
  });

  it('refuses one whose file lacks a change the room holds, a deletion too', async () => {
    const { tabs, told } = room();
    const baked = await asking();
    expect(await tabs.accept(editor, frame(highlightUpdate('m1', first), first))).toBe(true);
    expect(await tabs.replace(editor, baked)).toBe(false);
    expect(told.at(-1)).toEqual(refusedBy('live_changes_moved'));
    expect(await storedUpdates(db.env, PDF_LIVE_TAB, 't1')).toHaveLength(1);
    expect(await previousStoredFiles(db.env, 't1')).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      '[pdf] replacement-refused document=D tab=t1 name=live_changes_moved',
    );
  });

  it('refuses a file the document’s owner does not hold, at the size said', async () => {
    const { tabs, told } = room();
    const theirs = await store(bytesOf('%PDF-1.7\nsomeone else’s\n%%EOF\n'), 'mallory');
    expect(await tabs.replace(editor, await asking({ blob: theirs, size: 30 }))).toBe(false);
    expect(await tabs.replace(editor, await asking({ size: SECOND.byteLength + 1 }))).toBe(false);
    expect(told).toEqual([refusedBy('blob_missing'), refusedBy('blob_missing')]);
  });

  it('refuses where the server has no file storage', async () => {
    const { tabs, told } = room();
    delete db.env.FILES;
    expect(await tabs.replace(editor, await asking())).toBe(false);
    expect(told).toEqual([refusedBy('files_unavailable')]);
  });

  it('refuses, untold, what is no replacement, a tab of another kind, and a room with no storage', async () => {
    const { tabs, told } = room();
    expect(await tabs.replace(editor, { kind: 'pdf-stored', tabId: 't1' })).toBe(false);
    expect(await tabs.replace(editor, await asking({ tabId: 't2' }))).toBe(false);
    expect(await tabs.replace({ ...editor, documentId: null }, await asking())).toBe(false);
    // A kind that declares no replacement takes none.
    expect(await room(TEXT_DOCUMENT_LIVE_TAB).tabs.replace(editor, await asking())).toBe(false);
    expect(told).toEqual([]);
  });

  it('reads the tab again when a save moved its row in between, and gives up after a few', async () => {
    const { tabs } = room();
    const batch = db.env.DOCUMENT_DB.batch.bind(db.env.DOCUMENT_DB);
    // The write alone fails: the read of the stored state is a batch of two.
    let failures: Error[] = [new Error('D1_ERROR: tab_rev_stale')];
    vi.spyOn(db.env.DOCUMENT_DB, 'batch').mockImplementation((statements) => {
      const failure = statements.length > 2 ? failures.shift() : undefined;
      return failure ? Promise.reject(failure) : batch(statements);
    });
    expect(await tabs.replace(editor, await asking())).toBe(true);
    expect((await getTab(db.env, 'D', 't1'))!.blob).toBe(second);
    const another = bytesOf('%PDF-1.7\nanother\n%%EOF\n');
    const third = await store(another);
    const again = async () =>
      tabs.replace(editor, await asking({ from: second, blob: third, size: another.byteLength }));
    failures = [1, 2, 3].map(() => new Error('D1_ERROR: tab_rev_stale'));
    await expect(again()).rejects.toThrow('tab_rev_stale');
    failures = [new Error('disk')];
    await expect(again()).rejects.toThrow('disk');
    expect((await getTab(db.env, 'D', 't1'))!.blob).toBe(second);
  });
});

describe('a change made on a stored file', () => {
  it('is refused, and its sender told, once the tab names another', async () => {
    const { tabs, told, everyone } = room();
    expect(await tabs.replace(editor, await asking())).toBe(true);
    told.length = 0;
    everyone.length = 0;
    expect(await tabs.accept(editor, frame(highlightUpdate('late', first), first))).toBe(false);
    expect(told).toEqual([
      {
        kind: 'op',
        from: 'system',
        op: { kind: 'pdf-refused', tabId: 't1', name: 'stored_file_changed' },
      },
    ]);
    expect(everyone).toEqual([]);
    // One that names no file at all is refused the same way.
    const unnamed = {
      kind: 'pdf',
      tabId: 't1',
      update: base64OfBytes(highlightUpdate('x', second)),
    };
    expect(await tabs.accept(editor, unnamed)).toBe(false);
    // Made on the new file, it is stored, and relayed naming it.
    const made = frame(highlightUpdate('m2', second), second);
    expect(await tabs.accept(editor, made)).toBe(true);
    expect(everyone).toEqual([{ from: 'p1', op: made }]);
  });

  it('names nothing where the tab’s row names nothing to stand on', async () => {
    expect(PDF_LIVE_TAB.standsOn!({ kind: 'pdf' })).toBeNull();
    expect(PDF_LIVE_TAB.standsOn!({ kind: 'pdf', blob: first, size: 4 })).toBe(first);
    const { tabs } = room({ ...PDF_LIVE_TAB, standsOn: () => null });
    const unnamed = {
      kind: 'pdf',
      tabId: 't1',
      update: base64OfBytes(highlightUpdate('x', first)),
    };
    expect(await tabs.accept(editor, unnamed)).toBe(true);
    expect(await tabs.accept(editor, { ...unnamed, on: first })).toBe(false);
  });

  it('is refused by the door the same way', async () => {
    const { tabs } = room();
    const posted = (on?: BlobKey) =>
      tabs.acceptPosted('D', 't1', highlightUpdate('m1', first), on ? { on } : {});
    expect(await posted(second)).toBe('stands-elsewhere');
    expect(await posted()).toBe('stands-elsewhere');
    expect(await posted(first)).toBe('stored');
  });

  it('answers a posted update made on another file with 409 stored_file_changed', async () => {
    const { tabs } = room();
    (db.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (input: string, init?: RequestInit) => {
          const url = new URL(input);
          const on = url.searchParams.get('on');
          const outcome = await tabs.acceptPosted(
            'D',
            't1',
            new Uint8Array(init!.body as ArrayBuffer),
            on === null ? {} : { on },
          );
          return new Response(null, { status: outcome === 'stored' ? 204 : 412 });
        },
      }),
    };
    const post = (on: BlobKey | null) =>
      handleDocuments(
        makeTestRouteContext('POST', '/api/documents/D/pdf-documents/t1/updates', {
          env: db.env,
          owner: 'ada',
          rawBody: highlightUpdate('m1', first) as unknown as string,
          headers: {
            'Content-Type': 'application/octet-stream',
            ...(on ? { [PDF_STORED_FILE_HEADER]: on } : {}),
          },
        }),
      );
    const refused = await post(second);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'stored_file_changed' });
    expect((await post(null)).status).toBe(409);
    expect((await post(first)).status).toBe(204);
  });
});

describe('a previous version', () => {
  it('is held by its tab until its day, and the tab’s own file for as long as it is named', async () => {
    const until = previousVersionHeldUntil(5);
    expect(until).toBe(5 + FILE_PREVIOUS_VERSION_DAYS * DAY_MS);
    const body = { kind: 'pdf', blob: second, size: 9 };
    expect(tabBlobHolds(body, [{ blob: first, size: 7, replacedAt: 5 }])).toEqual([
      { key: first, until },
      { key: second, until: null },
    ]);
    // Replaced twice, the later day stands; a key the tab names again is held as its own.
    const twice = [
      { blob: first, size: 7, replacedAt: 5 },
      { blob: first, size: 7, replacedAt: 900 },
      { blob: second, size: 9, replacedAt: 50 },
    ];
    expect(tabBlobHolds(body, twice)).toEqual([
      { key: first, until: previousVersionHeldUntil(900) },
      { key: second, until: null },
    ]);
    expect(tabBlobHolds({ kind: 'text-document' }, twice)).toBeNull();
  });

  it('is pushed to the holds the retention sweep reads, with the replacement', async () => {
    const { tabs } = room();
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ['Date'] });
    expect(await tabs.replace(editor, await asking())).toBe(true);
    await db.flush();
    const holds = db.sql
      .prepare("SELECT key, until FROM document_blobs WHERE document_id = 'D' ORDER BY until")
      .all();
    expect(holds.map((hold) => ({ ...hold }))).toEqual([
      { key: second, until: null },
      { key: first, until: previousVersionHeldUntil(1_800_000_000_000) },
    ]);
  });

  it('stays readable through the document until its day', async () => {
    const { tabs } = room();
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ['Date'] });
    expect(await tabs.replace(editor, await asking())).toBe(true);
    const day = previousVersionHeldUntil(1_800_000_000_000);
    expect(await documentBlobHold(db.env, 'D', first, null, day - 1)).toEqual({
      tabId: 't1',
      size: FIRST.byteLength,
    });
    expect(await documentBlobHold(db.env, 'D', first, 't1', day - 1)).not.toBeNull();
    expect(await documentBlobHold(db.env, 'D', first, 't2', day - 1)).toBeNull();
    expect(await documentBlobHold(db.env, 'D', first, null, day)).toBeNull();
    expect(await documentBlobHold(db.env, 'D', second, null)).toEqual({
      tabId: 't1',
      size: SECOND.byteLength,
    });
    const read = await handleDocuments(
      makeTestRouteContext('GET', `/api/documents/D/files/${first}`, { env: db.env, owner: 'ada' }),
    );
    expect(read.status).toBe(200);
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(FIRST);
  });
});

describe('a whole-tab save of a PDF tab', () => {
  it('keeps the stored file, whatever it was sent', async () => {
    const stored = { kind: 'pdf', blob: second, size: 9 };
    const stale = { kind: 'pdf', blob: first, size: 7, name: 'Renamed' };
    expect(keepStoredFile(stale, stored)).toEqual({ ...stale, blob: second, size: 9 });
    const current = { kind: 'pdf', blob: second, size: 9, name: 'Renamed' };
    expect(keepStoredFile(current, stored)).toBe(current);
    // A tab that is new, of another kind, or was of another kind is answered as it came.
    expect(keepStoredFile(stale, null)).toBe(stale);
    expect(keepStoredFile(stale, { kind: 'text-document' })).toBe(stale);
    const text = { kind: 'text-document' };
    expect(keepStoredFile(text, stored)).toBe(text);
  });

  it('cannot undo a replacement from a browser that has not heard of it', async () => {
    const { tabs } = room();
    expect(await tabs.replace(editor, await asking())).toBe(true);
    const saved = await handleDocuments(
      makeTestRouteContext('PUT', '/api/documents/D/tabs/t1', {
        env: db.env,
        owner: 'ada',
        body: {
          id: 't1',
          name: 'Renamed',
          kind: 'pdf',
          elements: [],
          blob: first,
          size: FIRST.byteLength,
        },
      }),
    );
    expect(saved.status).toBe(200);
    expect(await getTab(db.env, 'D', 't1')).toMatchObject({
      name: 'Renamed',
      blob: second,
      size: SECOND.byteLength,
    });
    expect(console.info).toHaveBeenCalledWith('[pdf] save-kept-stored-file document=D tab=t1');
  });
});
