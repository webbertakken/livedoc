import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LiveThreads,
  TextDocumentState,
  VersionSnapshots,
  type TextDocumentComment,
} from '@livedoc/text-documents';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import {
  NOTICE_WINDOW_ENDS_KEY,
  RoomTextDocumentNotices,
  type RoomNoticesDeps,
} from './room-text-document-notices';

// docs/specs/034-text-documents/review.md "Notifications" (Batches): a window opens on a tab's first stored update,
// noting what it held just before; the document's window ends on the room's alarm, and its new comments are sent.

const T = 1_700_000_000_000;
const WINDOW = 1000;
const place = { documentId: 'D', tabId: 'td' };

let db: SqliteD1;
let updates: Uint8Array[];
let kv: Map<string, unknown>;
let now: number;
const send = vi.fn<NonNullable<RoomNoticesDeps['send']>>(async () => 1);
const info = vi.spyOn(console, 'info').mockImplementation(() => {});
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
afterAll(() => {
  info.mockRestore();
  warn.mockRestore();
});

const comment = (id: string): TextDocumentComment => ({
  id,
  text: id,
  at: T,
  author: { key: 'k', name: 'Ada', colour: '#000' },
});

/** The tab with one thread holding `ids`' comments. */
function withThread(ids: string[]): Uint8Array {
  const doc = TextDocumentState.load([TextDocumentState.fromBody([{ text: 'Quarterly results' }])]);
  LiveThreads.begin(
    doc,
    {
      id: 'th',
      tab: 't.0',
      ...LiveThreads.anchorFor(TextDocumentState.body(doc), 0, 9),
      quote: 'Quarterly',
      comment: comment(ids[0]!),
    },
    'test',
  );
  for (const id of ids.slice(1)) LiveThreads.reply(doc, 'th', comment(id), 'test');
  return TextDocumentState.encode(doc);
}

function keeper(overrides: Partial<RoomNoticesDeps> = {}) {
  return new RoomTextDocumentNotices({
    env: db.env,
    kv: () =>
      ({
        get: (k: string) => kv.get(k),
        put: (k: string, v: unknown) => void kv.set(k, v),
        delete: (k: string) => kv.delete(k),
      }) as unknown as ReturnType<RoomNoticesDeps['kv']>,
    documentId: () => 'D',
    storedUpdates: async () => updates,
    now: () => now,
    windowMs: WINDOW,
    send,
    ...overrides,
  });
}

const deletionRows = () =>
  db.sql.prepare('SELECT author, name FROM text_document_notice_deletions').all();

const baselines = () =>
  db.sql.prepare('SELECT tab_id, since, comment_ids FROM text_document_notice_baselines').all();

beforeEach(() => {
  db = sqliteD1({ RESEND_API_KEY: 're_test' });
  db.sql
    .prepare('INSERT INTO tabs (id, name, data, updated_at, rev) VALUES (?, ?, ?, 1, 1)')
    .run('td', 'Notes', '{"kind":"text-document","format":"odf","elements":[]}');
  updates = [withThread(['c0'])];
  kv = new Map();
  now = T;
  send.mockClear();
});

describe('a text document’s notification window', () => {
  it('opens on the first update, noting the comments the tab held before it', async () => {
    const notices = keeper();
    expect(notices.deadline()).toBeNull();
    await notices.ready(place);
    expect(baselines()).toEqual([{ tab_id: 'td', since: T, comment_ids: '["c0"]' }]);
    expect(notices.deadline()).toBe(T + WINDOW);
    now = T + 10;
    await notices.ready(place);
    expect(baselines()).toHaveLength(1);
    expect(notices.deadline()).toBe(T + WINDOW);
  });

  it('opens nothing where email is not configured', async () => {
    db.env.RESEND_API_KEY = undefined;
    await keeper().ready(place);
    expect(baselines()).toEqual([]);
  });

  it('never stands in an edit’s way', async () => {
    await keeper({ storedUpdates: () => Promise.reject(new Error('gone')) }).ready(place);
    expect(warn).toHaveBeenCalledWith(
      '[text-document-notices] window failed doc=D tab=td error=Error',
    );
  });

  it('ends on the alarm, sending what is new and closing every tab’s window', async () => {
    const notices = keeper();
    await notices.ready(place);
    updates = [withThread(['c0', 'c1'])];
    await notices.alarm(T + WINDOW - 1);
    expect(send).not.toHaveBeenCalled();
    await notices.alarm(T + WINDOW);
    expect(send).toHaveBeenCalledTimes(1);
    const [deps, windows] = send.mock.calls[0]!;
    expect(windows).toEqual([
      {
        tabId: 'td',
        commentIds: ['c0'],
        baseline: { stateVector: expect.any(Uint8Array), deletions: expect.any(Uint8Array) },
        deleters: [],
      },
    ]);
    expect(deps.documentId).toBe('D');
    expect((await deps.threadsOf('td')).flatMap((t) => t.comments.map((c) => c.id))).toEqual([
      'c0',
      'c1',
    ]);
    expect(baselines()).toEqual([]);
    expect(notices.deadline()).toBeNull();
    await notices.alarm(T + 2 * WINDOW);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends nothing for a room with no document, and logs a send that failed', async () => {
    await keeper().ready(place);
    await keeper({ documentId: () => null }).alarm(T + WINDOW);
    expect(send).not.toHaveBeenCalled();
    kv.set(NOTICE_WINDOW_ENDS_KEY, T);
    await keeper().ready(place);
    send.mockRejectedValueOnce(new Error('down'));
    await keeper().alarm(T + WINDOW);
    expect(warn).toHaveBeenCalledWith('[text-document-notices] send failed doc=D error=Error');
  });

  it('closes an ended window that held no tab without sending', async () => {
    kv.set(NOTICE_WINDOW_ENDS_KEY, T);
    await keeper().alarm(T);
    expect(send).not.toHaveBeenCalled();
    expect(kv.has(NOTICE_WINDOW_ENDS_KEY)).toBe(false);
  });

  it('keeps no deadline without a store to keep it in', async () => {
    const notices = keeper({ kv: () => undefined });
    await notices.ready(place);
    expect(notices.deadline()).toBeNull();
  });

  it('keeps each sender’s deletions while a window is open, and hands them to the send', async () => {
    const ann = { key: 'ka', name: 'Ann', color: '#111' };
    const notices = keeper();
    const doc = TextDocumentState.load(updates);
    doc.clientID = 77;
    const written: Uint8Array[] = [];
    doc.on('update', (u: Uint8Array) => written.push(u));
    TextDocumentState.body(doc).delete(0, 1);
    const deleting = written.at(-1)!;
    // An update that deletes nothing: no structs, an empty delete set.
    const inserting = Uint8Array.of(0, 0);
    // No window yet: nothing kept.
    await notices.stored(place, deleting, ann);
    expect(deletionRows()).toEqual([]);
    await notices.ready(place);
    // No key, or nothing deleted: nothing kept.
    await notices.stored(place, deleting, { ...ann, key: null });
    await notices.stored(place, inserting, ann);
    expect(deletionRows()).toEqual([]);
    await notices.stored(place, deleting, ann);
    await notices.stored(place, deleting, { ...ann, name: 'Ann B' });
    expect(deletionRows()).toEqual([{ author: 'ka', name: 'Ann B' }]);

    updates = [...updates, ...written];
    db.sql
      .prepare(
        'INSERT INTO text_document_clients (tab_id, client, author, name, color, first_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('td', 77, 'ka', 'Ann', '#111', T);
    await notices.alarm(T + WINDOW);
    const [deps, windows] = send.mock.calls[0]!;
    expect(windows[0]!.deleters).toEqual([
      { key: 'ka', name: 'Ann B', deletions: expect.any(Uint8Array) },
    ]);
    expect(VersionSnapshots.decodeDeletions(windows[0]!.deleters[0]!.deletions).clients.size).toBe(
      1,
    );
    expect(await deps.changesOf(windows[0]!)).toEqual([
      {
        tabId: 'td',
        kind: 'removed',
        text: 'Quarterly results',
        authorKey: 'ka',
        authorName: 'Ann',
      },
    ]);
    expect(deletionRows()).toEqual([]);
  });

  it('keeps nothing where email is not configured, and never stands in an edit’s way', async () => {
    db.env.RESEND_API_KEY = undefined;
    await keeper().stored(place, withThread(['c0']), { key: 'k', name: null, color: null });
    expect(deletionRows()).toEqual([]);
    db.env.RESEND_API_KEY = 're_test';
    await keeper().stored(place, Uint8Array.of(9, 9, 9), { key: 'k', name: null, color: null });
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/^\[text-document-notices\] deletions failed doc=D tab=td error=/),
    );
  });
});
