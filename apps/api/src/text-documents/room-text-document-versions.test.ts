import { describe, expect, it, vi } from 'vitest';
import { bytesOfBase64, TextDocumentState, versionDocument } from '@livedoc/text-documents';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { makeTestRouteContext } from '../routes/test-route-context';
import { handleDocuments } from '../routes/documents';
import { appendLiveTabUpdate, storedUpdates } from '../live-tabs/live-tab-store';
import { TEXT_DOCUMENT_LIVE_TAB } from './text-document-live-tab';
import {
  RoomTextDocumentVersions,
  VERSION_CAPS,
  type VersionCaps,
} from './room-text-document-versions';
import { versionRead, versionRows } from './text-document-version-rows';

// docs/specs/034-text-documents/live-editing-and-storage.md "Versions": taking, who changed what, naming, restoring.

const PLACE = { documentId: 'D', tabId: 't1' };
const ADA = { key: 'k-ada', name: 'Ada', color: '#1a73e8' };
const BEN = { key: 'k-ben', name: 'Ben', color: '#188038' };

async function room(caps: Partial<VersionCaps> = {}) {
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
  let now = Date.UTC(2026, 10, 27, 9);
  let ids = 0;
  const relayed: Uint8Array[] = [];
  const stored = () => storedUpdates(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1');
  const versions = new RoomTextDocumentVersions({
    env: db.env,
    storedUpdates: () => stored(),
    storeUpdate: async (_place, update) => {
      relayed.push(update);
      await appendLiveTabUpdate(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1', update);
    },
    now: () => now,
    newId: () => `v${(ids += 1)}`,
    caps: { ...VERSION_CAPS, ...caps },
  });
  // A person's browser: one live document, each edit stored by the room and then told to the keeper.
  const browser = TextDocumentState.load();
  const edit = async (change: (doc: typeof browser) => void, author = ADA) => {
    const before = TextDocumentState.stateVectorOf(TextDocumentState.encode(browser));
    change(browser);
    const update = TextDocumentState.since(TextDocumentState.encode(browser), before);
    await appendLiveTabUpdate(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1', update);
    await versions.stored(PLACE, update, author);
  };
  const type = (text: string, author = ADA) =>
    edit((doc) => TextDocumentState.replaceBody(doc, [{ text }]), author);
  const text = async () =>
    TextDocumentState.paragraphs(TextDocumentState.load(await stored())).map((p) => p.text);
  const rows = () => versionRows(db.env, 't1');
  return {
    db,
    versions,
    type,
    edit,
    text,
    rows,
    stored,
    relayed,
    tick: (ms: number) => (now += ms),
  };
}

const textAt = async (r: Awaited<ReturnType<typeof room>>, id: string) => {
  const read = versionRead(await r.rows(), id, new Map())!;
  const doc = versionDocument(await r.stored(), bytesOfBase64(read.snapshot)!);
  return TextDocumentState.paragraphs(doc).map((p) => p.text);
};

describe('RoomTextDocumentVersions', () => {
  it('takes an automatic version when a window reaches its updates', async () => {
    const r = await room({ everyUpdates: 3 });
    await r.type('one');
    await r.type('two');
    expect(await r.rows()).toHaveLength(0);
    await r.type('three');
    const [version] = await r.rows();
    expect(version).toMatchObject({ kind: 'automatic', name: null, takenBy: null });
    expect(version!.editors).toEqual([ADA]);
    expect(await textAt(r, version!.id)).toEqual(['three']);
  });

  it('takes one when a window reaches its time', async () => {
    const r = await room();
    await r.type('one');
    r.tick(VERSION_CAPS.everyMs);
    await r.type('two');
    expect(await r.rows()).toHaveLength(1);
  });

  it('reads each version whole, as it stood, after later deletions', async () => {
    const r = await room({ everyUpdates: 1 });
    await r.type('first');
    await r.type('second');
    await r.type('third');
    const rows = await r.rows();
    expect(await textAt(r, rows[0]!.id)).toEqual(['first']);
    expect(await textAt(r, rows[1]!.id)).toEqual(['second']);
  });

  it('names each editor once, and the deletions each made', async () => {
    const r = await room({ everyUpdates: 3 });
    await r.type('Ada wrote');
    await r.type('Ben wrote', BEN);
    await r.type('Ada again');
    const [version] = await r.rows();
    expect(version!.editors.map((e) => e.key).sort()).toEqual(['k-ada', 'k-ben']);
    expect(Object.keys(version!.deletedBy).sort()).toEqual(['k-ada', 'k-ben']);
  });

  it('keeps the first author of a client id and logs another key using it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await room({ everyUpdates: 2 });
    await r.type('mine');
    await r.type('forged', BEN);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[text-document] author-conflict'));
    const [version] = await r.rows();
    expect(version!.editors.map((e) => e.key)).toContain('k-ada');
    warn.mockRestore();
  });

  it('logs a failed record and keeps the edit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await room();
    const batch = r.db.env.DOCUMENT_DB.batch.bind(r.db.env.DOCUMENT_DB);
    const spy = vi.spyOn(r.db.env.DOCUMENT_DB, 'batch').mockRejectedValueOnce(new Error('boom'));
    await expect(r.type('kept')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[text-document] author-record-failed'),
    );
    expect(await r.text()).toEqual(['kept']);
    spy.mockImplementation(batch);
    warn.mockRestore();
  });

  it('takes none past the row cap, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await room({ everyUpdates: 1, rowBytes: 4 });
    await r.type('big');
    expect(await r.rows()).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[text-document] version-too-large'));
    warn.mockRestore();
  });

  it('thins a day older than the days kept whole to its newest version, the rest still read whole', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const r = await room({ everyUpdates: 1 });
    await r.type('a');
    r.tick(60_000);
    await r.type('b');
    r.tick(31 * 86_400_000);
    await r.type('c');
    const rows = await r.rows();
    expect(rows.map((v) => v.id)).toEqual(['v2', 'v3']);
    expect(await textAt(r, 'v2')).toEqual(['b']);
    expect(await textAt(r, 'v3')).toEqual(['c']);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('[text-document] versions-thinned'));
    info.mockRestore();
  });

  it('keeps a version rather than hand it on past the row cap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Each version alone fits the cap; the two together do not.
    const r = await room({ everyUpdates: 1 });
    await r.type('a');
    await r.type('b');
    const cap = Math.max(...(await r.rows()).map((v) => v.bytes));
    const capped = await room({ everyUpdates: 1, autoMax: 1, rowBytes: cap });
    await capped.type('a');
    await capped.type('b');
    expect((await capped.rows()).map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[text-document] version-too-large'));
    warn.mockRestore();
  });

  describe('naming', () => {
    it('names the newest version when nothing changed since it', async () => {
      const r = await room({ everyUpdates: 1 });
      await r.type('done');
      const result = await r.versions.nameCurrent(PLACE, 'Final', ADA);
      expect(result).toMatchObject({
        ok: true,
        version: { id: 'v1', kind: 'named', name: 'Final' },
      });
      expect(await r.rows()).toHaveLength(1);
    });

    it('takes a named version of now when something changed', async () => {
      const r = await room();
      await r.type('draft');
      const result = await r.versions.nameCurrent(PLACE, 'Draft', ADA);
      expect(result).toMatchObject({
        ok: true,
        version: { kind: 'named', name: 'Draft', takenBy: ADA },
      });
    });

    it('renames, and an empty name makes a version automatic again', async () => {
      const r = await room({ everyUpdates: 1 });
      await r.type('x');
      await r.versions.name(PLACE, 'v1', 'A', ADA);
      await r.versions.name(PLACE, 'v1', 'B', ADA);
      expect((await r.rows())[0]).toMatchObject({ kind: 'named', name: 'B' });
      await r.versions.name(PLACE, 'v1', null, ADA);
      expect((await r.rows())[0]).toMatchObject({ kind: 'automatic', name: null });
    });

    it('refuses a name past the named versions cap, and an unknown version', async () => {
      const r = await room({ everyUpdates: 1, namedMax: 1 });
      await r.type('a');
      await r.type('b');
      await r.versions.name(PLACE, 'v1', 'One', ADA);
      expect(await r.versions.name(PLACE, 'v2', 'Two', ADA)).toEqual({
        ok: false,
        error: 'named_versions_full',
      });
      expect(await r.versions.name(PLACE, 'v1', 'Renamed', ADA)).toMatchObject({ ok: true });
      expect(await r.versions.name(PLACE, 'nope', 'X', ADA)).toEqual({
        ok: false,
        error: 'version_not_found',
      });
    });
  });

  describe('restoring', () => {
    it('brings the version back as one change by the restorer, and says where from', async () => {
      const r = await room({ everyUpdates: 1 });
      await r.type('original');
      await r.type('changed');
      const result = await r.versions.restore(PLACE, 'v1', BEN);
      expect(await r.text()).toEqual(['original']);
      expect(r.relayed).toHaveLength(1);
      const newest = (await r.rows()).at(-1)!;
      expect(newest).toMatchObject({ restoredFrom: 'v1', takenBy: BEN });
      expect(newest.editors.map((e) => e.key)).toEqual(['k-ben']);
      expect(result).toMatchObject({ ok: true, version: { id: newest.id, restoredFrom: 'v1' } });
    });

    it('takes a version of now first when edits stand unversioned', async () => {
      const r = await room({ everyUpdates: 2 });
      await r.type('a');
      await r.type('b');
      await r.type('c');
      await r.versions.restore(PLACE, 'v1', BEN);
      const rows = await r.rows();
      expect(rows).toHaveLength(3);
      expect(await textAt(r, rows[1]!.id)).toEqual(['c']);
      expect(await r.text()).toEqual(['b']);
    });

    it('keeps an edit made on the state it read on top of it', async () => {
      const r = await room({ everyUpdates: 1 });
      await r.type('original');
      await r.type('changed');
      await r.versions.restore(PLACE, 'v1', BEN);
      // The browser never heard of the restore: its edit was made on what the restore read.
      await r.edit((doc) =>
        TextDocumentState.replaceBody(doc, [{ text: 'changed' }, { text: 'late' }]),
      );
      expect(await r.text()).toEqual(expect.arrayContaining(['original', 'late']));
    });

    it('changes nothing when the document already reads as the version', async () => {
      const r = await room({ everyUpdates: 1 });
      await r.type('same');
      const result = await r.versions.restore(PLACE, 'v1', BEN);
      expect(result).toMatchObject({ ok: true, version: { id: 'v1' } });
      expect(r.relayed).toHaveLength(0);
      expect(await r.rows()).toHaveLength(1);
    });

    it('refuses a version the tab does not have', async () => {
      const r = await room();
      expect(await r.versions.restore(PLACE, 'nope', BEN)).toEqual({
        ok: false,
        error: 'version_not_found',
      });
    });
  });
});
