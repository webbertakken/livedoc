import { sqliteD1, type SqliteD1 } from './test-sqlite-d1';
import { testDocumentRoom } from './test-document-room';
import type { DocumentSeed } from './document-room/document-create';
import type { RouteIdentity } from './document-room/document-route';
import type { Env } from './types';

// Several real rooms, each on a SQLite of its own, reaching one another through the env's DOCUMENT_ROOM as on
// Cloudflare, beside one D1 (docs/specs/006-document/document-storage.md): what a test of shared
// tabs between documents needs, since in the one-database harness (test-sqlite-d1.ts) two documents cannot each hold
// a tab of the same id. A room named in `offline` throws on every call, as one that cannot be reached; a
// `<room>.<method>` there throws on that call only.
//
// Not a `.test.ts` file, so vitest doesn't collect it as a suite.

export const NETWORK_T0 = 1_700_000_000_000;

export const ownerIdentity = (owner = 'o'): RouteIdentity => ({
  sessionAccountId: null,
  verifiedAccountId: null,
  accountEmail: null,
  sessionAuthTime: null,
  owner,
  token: null,
  workbench: null,
});

export function tabSeed(tabs: { id: string; name?: string; label?: string }[]): DocumentSeed {
  return {
    identity: ownerIdentity(),
    owner: 'o',
    recommit: false,
    savedAt: NETWORK_T0,
    createdAt: NETWORK_T0,
    presentation: null,
    itemTypes: null,
    tabs: tabs.map((t) => ({
      id: t.id,
      name: t.name ?? t.id,
      elements: t.label
        ? [
            {
              id: 'e1',
              type: 'shape',
              shape: 'square',
              x: 0,
              y: 0,
              width: 100,
              height: 60,
              label: t.label,
            } as never,
          ]
        : [],
    })),
    items: [],
    sheets: [],
  };
}

export type RoomNetwork = {
  d1: SqliteD1;
  env: Env;
  room: (id: string) => ReturnType<typeof testDocumentRoom>;
  offline: Set<string>;
  // Every call one room made to another: [to, method].
  calls: [string, string][];
};

export function roomNetwork(ids: readonly string[]): RoomNetwork {
  const d1 = sqliteD1({}, { keepD1Content: true });
  const rooms = new Map<string, ReturnType<typeof testDocumentRoom>>();
  const offline = new Set<string>();
  const calls: [string, string][] = [];
  const idOf = (name: string) =>
    ({
      name,
      toString: () => name,
      equals: (other: DurableObjectId) => String(other) === name,
    }) as unknown as DurableObjectId;
  const namespace = {
    idFromName: idOf,
    get: (id: DurableObjectId) => {
      const name = String(id);
      return new Proxy(
        {},
        {
          get: (_target, prop) => {
            if (prop === 'then') return undefined;
            return async (...args: unknown[]) => {
              calls.push([name, String(prop)]);
              if (offline.has(name) || offline.has(`${name}.${String(prop)}`))
                throw new Error(`room ${name} unreachable`);
              const room = rooms.get(name)?.room as unknown as Record<
                string,
                (...a: unknown[]) => Promise<unknown>
              >;
              if (!room) throw new Error(`no room ${name}`);
              return room[prop as string]!.apply(room, args);
            };
          },
        },
      );
    },
  };
  // A fresh env, so its DOCUMENT_ROOM is this network rather than the one-database harness's.
  const env = { ...d1.env, DB: d1.env.DB } as Env;
  Object.defineProperty(env, 'DOCUMENT_ROOM', { value: namespace, enumerable: false });
  for (const id of ids) {
    d1.sql.exec(
      `INSERT INTO documents (id, owner_id, name, saved_at, created_at) VALUES ('${id}', 'o', '${id}', ${NETWORK_T0}, ${NETWORK_T0})`,
    );
    rooms.set(id, testDocumentRoom(env, id));
  }
  return {
    d1,
    env,
    room: (id) => rooms.get(id)!,
    offline,
    calls,
  };
}
