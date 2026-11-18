// @vitest-environment jsdom
// docs/specs/016-platform/web-performance.md "The open is one read": a share link's open read carries the tab the
// visitor opens first and their own participant row, and the editor asks neither again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCUMENT_OPEN_HEADER } from '@livedoc/api-schema';
import { apiLoadShared } from './share';
import { apiLoadSelf, resetSelfForTests } from './self';
import { setTokenProvider } from './core';

const DOC = { id: 'd1', ownerId: 'owner', name: 'Board', tabs: [{ id: 't1', name: 'One' }] };
const TAB = {
  id: 't1',
  documentId: 'd1',
  name: 'One',
  orderIndex: 0,
  updatedAt: 1,
  rev: 3,
  elements: [],
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
      if (path.startsWith('/api/share/')) return new Response(JSON.stringify(answer));
      if (path === '/api/participants/g1')
        return new Response(JSON.stringify({ participant: READER }));
      return new Response('{}', { status: 404 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('apiLoadShared, as the editor opens the link', () => {
  it('asks once, marked as an open, and hands out the tab as the editor holds it', async () => {
    answer = { document: DOC, role: 'edit', tabId: null, openedTab: TAB, reader: READER };
    const resolved = await apiLoadShared('CODE1', 'g1', { open: true });
    expect(asked).toHaveLength(1);
    expect(asked[0]!.headers.get(DOCUMENT_OPEN_HEADER)).toBe('1');
    expect(resolved && 'opened' in resolved ? resolved.opened : undefined).toMatchObject({
      tab: { id: 't1' },
      rev: 3,
    });
  });

  it('answers the participant read the editor makes beside it, asking nothing more', async () => {
    answer = { document: DOC, role: 'edit', tabId: null, openedTab: TAB, reader: READER };
    const [, self] = await Promise.all([
      apiLoadShared('CODE2', 'g1', { open: true }),
      apiLoadSelf('g1'),
    ]);
    expect(self).toEqual({ id: 'g1', name: 'Swift Otter', color: '#0ea5e9', status: 'online' });
    expect(asked.map((a) => a.path)).toEqual(['/api/share/CODE2']);
  });

  it('leaves the row to its own read when the read is not an open', async () => {
    answer = { document: DOC, role: 'view', tabId: null };
    const [resolved, self] = await Promise.all([apiLoadShared('CODE3', 'g1'), apiLoadSelf('g1')]);
    expect(asked[0]!.headers.get(DOCUMENT_OPEN_HEADER)).toBeNull();
    expect(resolved).not.toHaveProperty('opened');
    expect(self?.name).toBe('Swift Otter');
    expect(asked.map((a) => a.path)).toEqual(['/api/share/CODE3', '/api/participants/g1']);
  });

  // docs/specs/013-workspace/share-password.md "Password cache": the grant is what the browser keeps.
  it('hands back the grant a password-protected link answers', async () => {
    answer = { document: DOC, role: 'view', tabId: null, shareGrant: 'spg_abc' };
    const resolved = await apiLoadShared('CODE4', 'g1');
    expect(resolved && 'shareGrant' in resolved ? resolved.shareGrant : undefined).toBe('spg_abc');
  });
});
