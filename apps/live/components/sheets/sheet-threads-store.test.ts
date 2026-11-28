// A spreadsheet's comment threads in the browser (docs/specs/029-sheets/review.md "Comments", "The thread write"): read
// once, kept at the highest change seen whatever order the api's answers and the room's relays arrive in, a removal
// never brought back by a late relay; a refusal answered with its code; This Browser's spreadsheet reads none.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SheetThread } from '@livedoc/document';
import { __setOfflineBackend, offlinePutRecord } from '@/lib/offline/offline-store';
import { memBackend, testRecord } from '@/lib/offline/offline-test-utils';
import { API_BASE } from '@/lib/api/core';
import { SheetThreadsStore, sheetThreadsFor } from './sheet-threads-store';

const scope = { ownerId: 'o1', documentId: 'd1', shareCode: 'sc', tabId: 'tab1' };
const thread = (v: number, id = 'th1', resolved = false): SheetThread => ({
  id,
  sheetId: 's1',
  anchor: { r1: 'ra', c1: 'ca', r2: 'ra', c2: 'ca' },
  resolved,
  comments: [{ id: 'c1', text: 'Hi', at: 1, author: { key: 'k', name: 'Ada', colour: '#111111' } }],
  v,
});

let answers: (() => Response)[];
let calls: { url: string; init: RequestInit }[];
beforeEach(() => {
  __setOfflineBackend(memBackend());
  answers = [];
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return answers.shift()!();
    }),
  );
});
afterEach(() => {
  __setOfflineBackend(null);
  vi.unstubAllGlobals();
});

const relay = (t: SheetThread | null, id = 'th1') =>
  ({ kind: 'sheet-thread', sheetId: 's1', tabId: 'tab1', id, thread: t }) as const;

describe('SheetThreadsStore', () => {
  it("reads the workbook's threads with the link's tab, telling its readers", async () => {
    answers.push(() => Response.json({ threads: [thread(2), thread(1, 'th2')] }));
    const store = new SheetThreadsStore(scope);
    const told = vi.fn();
    store.subscribe(told);
    await store.load();
    expect(calls[0]!.url).toBe(`${API_BASE}/documents/d1/sheet-threads?tabId=tab1`);
    expect(store.list().map((t) => t.id)).toEqual(['th1', 'th2']);
    expect(store.list('other')).toEqual([]);
    expect(store.thread('th1')?.v).toBe(2);
    expect([told.mock.calls.length, store.getVersion()]).toEqual([1, 1]);
  });

  it('keeps the newest state of a thread whatever order answers and relays arrive in', async () => {
    const store = new SheetThreadsStore(scope);
    answers.push(() => Response.json({ id: 'th1', thread: thread(2, 'th1', true) }));
    expect(await store.send('s1', { op: 'resolve', thread: 'th1', resolved: true })).toEqual({
      ok: true,
      thread: thread(2, 'th1', true),
    });
    expect(calls[0]!.url).toBe(`${API_BASE}/documents/d1/sheets/s1/threads?tabId=tab1`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      op: { op: 'resolve', thread: 'th1', resolved: true },
    });
    store.receive(relay(thread(1)));
    expect(store.thread('th1')?.resolved).toBe(true);
    store.receive(relay(thread(3)));
    expect(store.thread('th1')?.v).toBe(3);
  });

  it('never brings a removed thread back with a late relay', async () => {
    const store = new SheetThreadsStore(scope);
    store.receive(relay(thread(2)));
    answers.push(() => Response.json({ id: 'th1', thread: null }));
    await store.send('s1', { op: 'remove', thread: 'th1', comment: 'c1' });
    expect(store.thread('th1')).toBeUndefined();
    store.receive(relay(thread(2)));
    expect(store.thread('th1')).toBeUndefined();
    store.receive(relay(null, 'gone'));
    expect(store.list()).toEqual([]);
  });

  it("answers a refusal's code, and a lost network as such", async () => {
    const store = new SheetThreadsStore(scope);
    answers.push(() => Response.json({ error: 'threads_full' }, { status: 413 }));
    expect(await store.send('s1', { op: 'resolve', thread: 'x', resolved: true })).toEqual({
      ok: false,
      code: 'threads_full',
    });
    answers.push(() => {
      throw new TypeError('offline');
    });
    expect(await store.send('s1', { op: 'resolve', thread: 'x', resolved: true })).toEqual({
      ok: false,
      code: 'network',
    });
  });

  it('answers a refusal with no code by its status, on a whole-document session, and stops telling', async () => {
    const store = new SheetThreadsStore({ ...scope, tabId: null });
    const told = vi.fn();
    store.subscribe(told)();
    answers.push(() => new Response('', { status: 503 }));
    expect(await store.send('s1', { op: 'resolve', thread: 'x', resolved: true })).toEqual({
      ok: false,
      code: '503',
    });
    expect(calls[0]!.url).toBe(`${API_BASE}/documents/d1/sheets/s1/threads`);
    store.receive(relay(thread(1)));
    expect(told).not.toHaveBeenCalled();
  });

  it('keeps what it had when a read fails, and reads once at a time', async () => {
    const store = new SheetThreadsStore(scope);
    store.receive(relay(thread(1)));
    answers.push(() => new Response('no', { status: 500 }));
    await Promise.all([store.load(), store.load()]);
    expect(calls).toHaveLength(1);
    expect(store.thread('th1')?.v).toBe(1);
  });

  it("reads none of a spreadsheet in This Browser, and keeps one store a document's", async () => {
    await offlinePutRecord(testRecord());
    const store = new SheetThreadsStore({ ...scope, documentId: 'd1', tabId: null });
    await store.load();
    expect(calls).toEqual([]);
    const owner = {};
    expect(sheetThreadsFor(owner, scope)).toBe(sheetThreadsFor(owner, scope));
  });
});
