import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDocumentRoom } from '../test-document-room';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';

// Server-Timing from inside a document's room (docs/specs/016-platform/web-performance.md "The api"): its wake on
// the first request after one, its ready gate, each D1 round trip and its handler, on a successful answer only.

const D = 'doc-1';

const identity = (owner: string) => ({
  sessionAccountId: null,
  verifiedAccountId: null,
  accountEmail: null,
  sessionAuthTime: null,
  owner,
  token: null,
  workbench: null,
});

let d1: SqliteD1;

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  d1 = sqliteD1({}, { keepD1Content: true });
  d1.sql.exec(`
    INSERT INTO documents (id, owner_id, name, saved_at, created_at) VALUES ('${D}', 'o', 'Doc', 50, 10);
    INSERT INTO participants (id, name, color, created_at) VALUES ('o', 'Ada', '#000', 1);
  `);
});

afterEach(() => vi.restoreAllMocks());

const read = (room: ReturnType<typeof testDocumentRoom>['room'], owner = 'o') =>
  room.route(D, new Request(`https://api/api/documents/${D}`), identity(owner));

const names = (res: Response) =>
  (res.headers.get('Server-Timing') ?? '')
    .split(', ')
    .filter(Boolean)
    .map((entry) => entry.split(';')[0] ?? '');

describe('a room timing a document read', () => {
  it('times its wake, its gate, each D1 round trip and its handler', async () => {
    const { room } = testDocumentRoom(d1.env);
    const res = await read(room);
    expect(res.status).toBe(200);
    expect(names(res)).toEqual([
      'room-wake',
      'room-gate',
      ...names(res).filter((n) => n.startsWith('room-d1-')),
      'room-handler',
    ]);
    expect(names(res)).toContain('room-d1-1');
    expect(res.headers.get('Server-Timing')).toMatch(/^room-wake;dur=\d+, room-gate;dur=\d+/);
  });

  it('times the wake on the first request after one only', async () => {
    const { room } = testDocumentRoom(d1.env);
    await read(room);
    const again = await read(room);
    expect(names(again)).not.toContain('room-wake');
    expect(names(again)[0]).toBe('room-gate');
  });

  it('times nothing on a refusal, which would show the gate a caller failed', async () => {
    const { room } = testDocumentRoom(d1.env);
    const res = await read(room, 'stranger');
    expect(res.status).toBe(404);
    expect(res.headers.get('Server-Timing')).toBeNull();
  });
});
