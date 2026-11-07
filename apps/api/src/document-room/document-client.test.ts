import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../types';
import { askRoom, DOCUMENT_ID_HEADER, documentRoom } from './document-client';

// The worker's one way into a document's room (docs/specs/006-document/document-storage.md "Interfaces
// and contracts").

function envWith(stub: Record<string, unknown>) {
  const named: string[] = [];
  const env = {
    DOCUMENT_ROOM: {
      idFromName: (n: string) => {
        named.push(n);
        return n;
      },
      get: () => stub,
    },
  } as unknown as Env;
  return { env, named };
}

describe('documentRoom', () => {
  it('names the document on every fetch', async () => {
    const seen: Headers[] = [];
    const { env } = envWith({
      fetch: async (input: Request | string, init?: RequestInit) => {
        seen.push(typeof input === 'string' ? new Headers(init?.headers) : input.headers);
        return new Response('ok');
      },
    });
    const room = documentRoom(env, 'doc-9');
    await room.fetch('https://room/broadcast', { method: 'POST', body: '{}' });
    await room.fetch(
      new Request('https://api/api/documents/doc-9/ws', { headers: { Upgrade: 'websocket' } }),
    );
    expect(seen.map((h) => h.get(DOCUMENT_ID_HEADER))).toEqual(['doc-9', 'doc-9']);
    expect(seen[1]!.get('Upgrade')).toBe('websocket');
  });

  it('fills the document id into every RPC', async () => {
    const calls: unknown[][] = [];
    const record =
      (name: string) =>
      async (...args: unknown[]) => {
        calls.push([name, ...args]);
        return null;
      };
    const names = [
      'route',
      'create',
      'outline',
      'hasTab',
      'placesImage',
      'image',
      'exportCopy',
      'importCopy',
      'item',
      'respondToForm',
    ];
    const { env, named } = envWith(Object.fromEntries(names.map((n) => [n, record(n)])));
    const room = documentRoom(env, 'doc-3');
    const request = new Request('https://api/x');
    const identity = { ownerId: 'o' } as never;
    await room.route(request, identity);
    await room.create({} as never);
    await room.outline();
    await room.hasTab('t1');
    await room.placesImage('img', null);
    await room.image(request, identity);
    await room.exportCopy('t1', 'me');
    await room.importCopy({} as never);
    await room.item('i1');
    await room.respondToForm(request, identity);
    expect(named).toEqual(['doc-3']);
    expect(calls.map((c) => c[0])).toEqual(names);
    expect(calls.every((c) => c[1] === 'doc-3')).toBe(true);
  });

  it('is the only place the worker stubs a room', () => {
    const root = fileURLToPath(new URL('..', import.meta.url).href);
    const offenders = readdirSync(root, { recursive: true })
      .map(String)
      .filter(
        (f) =>
          f.endsWith('.ts') &&
          !f.endsWith('.test.ts') &&
          !f.startsWith('test-') &&
          f !== join('document-room', 'document-client.ts'),
      )
      .filter((f) =>
        readFileSync(join(root, f), 'utf8')
          .split('\n')
          .some(
            (line) => !/^\s*(\/\/|\*)/.test(line) && /DOCUMENT_ROOM\.get\(|\bns\.get\(/.test(line),
          ),
      );
    expect(offenders).toEqual([]);
  });
});

describe('askRoom', () => {
  it("answers the room's response", async () => {
    const res = await askRoom(new Request('https://api/x'), async () => new Response('ok'));
    expect(await res.text()).toBe('ok');
  });

  it('answers 503 room_unavailable when the call throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await askRoom(new Request('https://api/x'), async () => {
      throw new Error('gone');
    });
    expect(res.status).toBe(503);
    error.mockRestore();
    warn.mockRestore();
  });
});
