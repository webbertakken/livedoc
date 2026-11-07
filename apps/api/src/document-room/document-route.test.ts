import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleDocuments } from '../routes/documents';
import { makeTestRouteContext } from '../routes/test-route-context';
import type { DocumentEnv, Env } from '../types';
import { documentRouteContext, identityOf, type RouteIdentity } from './document-route';

// No document here owes its room a purge (G3 is room-purge.test.ts's).
vi.mock('../room-purge-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../room-purge-client')>()),
  purgeOwed: vi.fn(async () => false),
}));

// Routing (docs/specs/006-document/document-storage.md): every path under /api/documents/:id/
// that is not the room's admission or the copy is handed to the document's room with the caller the worker
// resolved, and the room rebuilds the same RouteContext from it.

type Asked = { documentId: string; path: string; method: string; identity: RouteIdentity };

function worker(answer: () => Promise<Response> = async () => new Response('room')) {
  const asked: Asked[] = [];
  const env = {
    DOCUMENT_ROOM: {
      idFromName: (name: string) => name,
      get: (documentId: string) => ({
        route: async (id: string, request: Request, identity: RouteIdentity) => {
          expect(id).toBe(documentId);
          asked.push({
            documentId: id,
            path: new URL(request.url).pathname,
            method: request.method,
            identity,
          });
          return answer();
        },
      }),
    },
  } as unknown as Env;
  const call = (method: string, path: string) => {
    const ctx = makeTestRouteContext(method, path, {
      owner: 'guest-1',
      sessionAccountId: 'user_1',
      accountEmail: 'a@b.c',
      token: { id: 'tok', readOnly: true },
    });
    return handleDocuments({ ...ctx, env });
  };
  return { asked, call };
}

afterEach(() => vi.restoreAllMocks());

describe('the document route', () => {
  it.each([
    ['GET', '/api/documents/D'],
    ['PUT', '/api/documents/D'],
    ['DELETE', '/api/documents/D'],
    ['GET', '/api/documents/D/tabs/t1'],
    ['PUT', '/api/documents/D/tabs/t1'],
    ['POST', '/api/documents/D/items'],
    ['GET', '/api/documents/D/sheets/s1'],
    ['POST', '/api/documents/D/changesets'],
    ['GET', '/api/documents/D/images/i1'],
  ])('hands %s %s to the document room', async (method, path) => {
    const { asked, call } = worker();
    const res = await call(method, path);
    expect(await res.text()).toBe('room');
    expect(asked).toEqual([
      {
        documentId: 'D',
        path,
        method,
        identity: {
          sessionAccountId: 'user_1',
          verifiedAccountId: 'user_1',
          accountEmail: 'a@b.c',
          sessionAuthTime: null,
          owner: 'guest-1',
          token: { id: 'tok', readOnly: true },
          workbench: null,
        },
      },
    ]);
  });

  it('names no room for an id longer than any document id', async () => {
    const { asked, call } = worker();
    const res = await call('GET', `/api/documents/${'x'.repeat(201)}`);
    expect(res.status).toBe(404);
    expect(asked).toEqual([]);
  });

  it('answers 503 room_unavailable, logged, when the room throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { call } = worker(async () => {
      throw new Error('overloaded');
    });
    const res = await call('GET', '/api/documents/D/tabs/t1');
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('5');
    expect(await res.json()).toMatchObject({ error: 'room_unavailable' });
    expect(error).toHaveBeenCalledWith(
      '[room-route] failed id=D path=/api/documents/D/tabs/t1 error=Error',
      expect.any(Error),
    );
  });
});

describe('the route identity', () => {
  it('rebuilds the context the worker resolved inside the room', () => {
    const outer = makeTestRouteContext('POST', '/api/documents/D/items?x=1', {
      owner: 'guest-1',
      sessionAccountId: 'user_1',
      token: { id: 'tok' },
      workbench: { documentId: 'D' } as never,
    });
    const roomEnv = { DOCUMENT_DB: {} } as unknown as DocumentEnv;
    const waitUntil = vi.fn();
    const inner = documentRouteContext(roomEnv, outer.request, identityOf(outer), waitUntil);
    expect(inner.env).toBe(roomEnv);
    expect(inner.segments).toEqual(['api', 'documents', 'D', 'items']);
    expect(inner.url.search).toBe('?x=1');
    expect(inner.resolveOwner()).toBe('guest-1');
    expect(inner.sessionAccountId).toBe('user_1');
    expect(inner.verifiedAccountId).toBe('user_1');
    expect(inner.token).toEqual({ id: 'tok' });
    expect(inner.workbench).toEqual({ documentId: 'D' });
    expect(inner.waitUntil).toBe(waitUntil);
  });
});
