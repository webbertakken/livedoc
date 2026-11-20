import { beforeEach, describe, expect, it } from 'vitest';
import { PREFERENCES_BODY_MAX } from '@livedoc/api-schema';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { makeTestRouteContext } from './test-route-context';
import { handlePreferences } from './preferences';

// Per-user editor preferences (docs/specs/007-editor/user-preferences.md), against the real schema.

let db: SqliteD1;

type Who = { owner: string; sessionAccountId: string | null };
const guest: Who = { owner: 'guest-1', sessionAccountId: null };
const account: Who = { owner: 'acct_live', sessionAccountId: 'acct_live' };
const closed: Who = { owner: 'acct_gone', sessionAccountId: 'acct_gone' };

const call = (method: string, who: Who, body?: unknown) =>
  handlePreferences(
    makeTestRouteContext(method, '/api/preferences', { env: db.env, ...who, body }),
  );

const rows = () =>
  db.sql
    .prepare('SELECT owner_id FROM user_preferences ORDER BY owner_id')
    .all()
    .map((r) => r['owner_id']);

beforeEach(() => {
  db = sqliteD1();
  db.sql
    .prepare(
      `INSERT INTO identity_users (id, name, email, emailVerified, image, createdAt, updatedAt)
       VALUES ('acct_live', 'Ada', 'ada@example.com', 1, NULL, 0, 0)`,
    )
    .run();
});

describe('handlePreferences', () => {
  it('stores and reads back a guest’s and an account’s preferences', async () => {
    expect((await call('PUT', guest, { prefs: { grid: true } })).status).toBe(204);
    expect((await call('PUT', account, { prefs: { grid: false } })).status).toBe(204);
    expect(await (await call('GET', guest)).json()).toEqual({ prefs: { grid: true } });
    expect((await call('PUT', account, { prefs: { grid: false, snap: true } })).status).toBe(204);
    expect(await (await call('GET', account)).json()).toEqual({
      prefs: { grid: false, snap: true },
    });
    expect(rows()).toEqual(['acct_live', 'guest-1']);
  });

  // A session token outlives its account by up to 15 minutes; closing the account deleted its preferences, and
  // a write in that window must not bring them back for an account nothing sweeps.
  it('refuses to write a closed account’s preferences back', async () => {
    const res = await call('PUT', closed, { prefs: { grid: true } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'unknown_owner' });
    expect(rows()).toEqual([]);
  });

  it('400s a body past PREFERENCES_BODY_MAX, and takes one at it (user-preferences.md "It fits")', async () => {
    const at = (n: number) => ({
      prefs: { pad: 'x'.repeat(n - JSON.stringify({ prefs: { pad: '' } }).length) },
    });
    expect(JSON.stringify(at(PREFERENCES_BODY_MAX)).length).toBe(PREFERENCES_BODY_MAX);
    expect((await call('PUT', guest, at(PREFERENCES_BODY_MAX + 1))).status).toBe(400);
    expect(rows()).toEqual([]);
    expect((await call('PUT', guest, at(PREFERENCES_BODY_MAX))).status).toBe(204);
  });

  it('400s a body that is no preferences object', async () => {
    expect((await call('PUT', guest, { prefs: 'x' })).status).toBe(400);
    expect(rows()).toEqual([]);
  });
});
