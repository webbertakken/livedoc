// @vitest-environment jsdom
// docs/specs/016-platform/web-performance.md "The open is one read": the editor's document read answers the tab it
// opens first and the reader's own participant row, and the editor asks neither again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const offline = vi.hoisted(() => ({ isOfflineId: vi.fn(async (_id: string) => false) }));
vi.mock('../offline/offline-ids', () => offline);

import { DOCUMENT_OPEN_HEADER } from '@livedoc/api-schema';
import { apiOpenDocument } from './documents';
import { apiLoadSelf, resetSelfForTests } from './self';
import { setTokenProvider } from './core';

const DOC = { id: 'd1', ownerId: 'g1', name: 'Board', tabs: [{ id: 't1', name: 'One' }] };
const TAB = {
  id: 't1',
  documentId: 'd1',
  name: 'One',
  orderIndex: 0,
  updatedAt: 1,
  rev: 3,
  elements: [{ id: 'a', type: 'table', x: 0, y: 0, width: 10, height: 10, cells: [['x'], []] }],
};
const READER = { id: 'g1', name: 'Swift Otter', color: '#0ea5e9', createdAt: 1, pictureUrl: null };

let asked: { path: string; headers: Headers }[];
let answer: Record<string, unknown>;

beforeEach(() => {
  resetSelfForTests();
  setTokenProvider(null);
  asked = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, 'https://docs.nu').pathname;
      asked.push({ path, headers: new Headers(init?.headers) });
      if (path === '/api/documents/d1') return new Response(JSON.stringify(answer));
      if (path === '/api/participants/g1')
        return new Response(JSON.stringify({ participant: READER }));
      return new Response('{}', { status: 404 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('apiOpenDocument', () => {
  it('asks once, marked as an open, and hands out the tab as the editor holds it', async () => {
    answer = { document: DOC, openedTab: TAB, reader: READER };
    const opened = await apiOpenDocument('g1', 'd1');
    expect(asked).toHaveLength(1);
    expect(asked[0]!.headers.get(DOCUMENT_OPEN_HEADER)).toBe('1');
    expect(opened?.opened?.rev).toBe(3);
    expect(opened?.opened?.tab).not.toHaveProperty('documentId');
    expect(opened?.opened?.tab.elements[0]).toMatchObject({ cells: [['x'], ['']] });
  });

  it('answers the participant read the editor makes beside it, asking nothing more', async () => {
    answer = { document: DOC, openedTab: TAB, reader: READER };
    const [, self] = await Promise.all([apiOpenDocument('g1', 'd1'), apiLoadSelf('g1')]);
    expect(self).toEqual({ id: 'g1', name: 'Swift Otter', color: '#0ea5e9', status: 'online' });
    expect(asked.map((a) => a.path)).toEqual(['/api/documents/d1']);
  });

  it('reads a reader with no row yet as none, so the editor writes it', async () => {
    answer = { document: DOC, openedTab: TAB, reader: null };
    const [, self] = await Promise.all([apiOpenDocument('g1', 'd1'), apiLoadSelf('g1')]);
    expect(self).toBeNull();
    expect(asked.map((a) => a.path)).toEqual(['/api/documents/d1']);
  });

  it('leaves the tab and the row to their own reads when the answer carries neither', async () => {
    answer = { document: DOC };
    const [opened, self] = await Promise.all([apiOpenDocument('g1', 'd1'), apiLoadSelf('g1')]);
    expect(opened).not.toHaveProperty('opened');
    expect(self?.name).toBe('Swift Otter');
    expect(asked.map((a) => a.path)).toEqual(['/api/documents/d1', '/api/participants/g1']);
  });

  it('says a document without a tab to open has none', async () => {
    answer = { document: { ...DOC, tabs: [] }, openedTab: null, reader: READER };
    expect((await apiOpenDocument('g1', 'd1'))?.opened).toBeNull();
  });

  it('reads the row itself when the open fails', async () => {
    answer = {};
    vi.mocked(fetch).mockImplementationOnce(async () => new Response('{}', { status: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const opening = apiOpenDocument('g1', 'd1');
    opening.catch(() => {});
    const self = await apiLoadSelf('g1');
    expect(self?.name).toBe('Swift Otter');
  });
});
