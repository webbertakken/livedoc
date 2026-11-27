import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createShareLink } from '../db/share';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { handleDocuments } from './documents';
import { makeTestRouteContext } from './test-route-context';

// docs/specs/034-text-documents/review.md "Notifications" (The setting): a signed-in Editor's or Participant's own,
// only where email is configured; never a Viewer's or a guest's.

let db: SqliteD1;
const PATH = '/api/documents/D/notification-settings';
const info = vi.spyOn(console, 'info').mockImplementation(() => {});

type Caller = { account?: string | null; code?: string; owner?: string; path?: string };

function call(
  method: string,
  body: unknown,
  { account = 'owner', code, owner, path = PATH }: Caller = {},
) {
  return handleDocuments(
    makeTestRouteContext(method, path, {
      env: db.env,
      owner: owner ?? account ?? 'guest-1',
      verifiedAccountId: account,
      ...(body === undefined ? {} : { body }),
      ...(code ? { headers: { 'X-Share-Code': code } } : {}),
    }),
  );
}

beforeEach(async () => {
  db = sqliteD1({ RESEND_API_KEY: 're_test' });
  await call(
    'POST',
    {
      id: 'D',
      name: 'Report',
      tabs: [{ id: 't1', name: 'T', kind: 'text-document', format: 'odf', elements: [] }],
    },
    { path: '/api/documents' },
  );
  info.mockClear();
});

describe('notification settings', () => {
  it('answers the defaults, then keeps what is chosen', async () => {
    expect(await (await call('GET', undefined)).json()).toEqual({
      comments: 'for-you',
      edits: 'none',
    });
    const put = await call('PUT', { comments: 'all', edits: 'added-or-removed' });
    expect(put.status).toBe(200);
    expect(await (await call('GET', undefined)).json()).toEqual({
      comments: 'all',
      edits: 'added-or-removed',
    });
    expect(info).toHaveBeenCalledWith(
      '[text-document-notices] setting saved doc=D comments=all edits=added-or-removed',
    );
  });

  it('refuses a body that names no setting', async () => {
    const res = await call('PUT', { comments: 'weekly', edits: 'none' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_setting' });
    const garbled = handleDocuments(
      makeTestRouteContext('PUT', PATH, {
        env: db.env,
        owner: 'owner',
        verifiedAccountId: 'owner',
        rawBody: '{not json',
      }),
    );
    expect((await garbled).status).toBe(400);
  });

  it('refuses a guest, who has no address', async () => {
    const res = await call('GET', undefined, { account: null, owner: 'owner' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'account_required' });
  });

  it('is not there where email is not configured', async () => {
    db.env.RESEND_API_KEY = undefined;
    const res = await call('GET', undefined);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'email_off' });
  });

  it('answers a missing document as missing', async () => {
    const res = await handleDocuments(
      makeTestRouteContext('GET', '/api/documents/nope/notification-settings', {
        env: db.env,
        owner: 'owner',
        verifiedAccountId: 'owner',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('leaves other methods to other routes', async () => {
    const res = await call('DELETE', undefined);
    expect(res.status).not.toBe(200);
  });

  describe('through a share link', () => {
    beforeEach(async () => {
      await createShareLink(db.env, 'D', 'EDITCODE', 'edit');
      await createShareLink(db.env, 'D', 'PARTCODE', 'participate');
      await createShareLink(db.env, 'D', 'VIEWCODE', 'view');
    });

    it.each([
      ['EDITCODE', 200],
      ['PARTCODE', 200],
      ['VIEWCODE', 403],
    ])('a visitor through %s is answered %i', async (code, status) => {
      const res = await call('PUT', { comments: 'none', edits: 'none' }, { account: 'ada', code });
      expect(res.status).toBe(status);
    });

    it('keeps each person’s own', async () => {
      await call('PUT', { comments: 'all', edits: 'none' }, { account: 'ada', code: 'EDITCODE' });
      expect(
        await (await call('GET', undefined, { account: 'bo', code: 'EDITCODE' })).json(),
      ).toEqual({ comments: 'for-you', edits: 'none' });
    });
  });
});
