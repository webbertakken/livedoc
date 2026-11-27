import { beforeEach, describe, expect, it, vi } from 'vitest';
import { noticeLinkToken } from '../auth/notice-links';
import { readNoticeSetting, writeNoticeSetting } from '../db/text-document-notice-settings';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { handleNoticeLink } from './notice-link-routes';
import { makeTestRouteContext } from './test-route-context';

// docs/specs/034-text-documents/review.md "Notifications" (In every email): the signed settings link changes one
// person's setting for one document, without signing in.

const T = 1_700_000_000_000;
const SECRET = 's'.repeat(40);
let db: SqliteD1;
const info = vi.spyOn(console, 'info').mockImplementation(() => {});

function call(method: string, token: string, body?: unknown) {
  return handleNoticeLink(
    makeTestRouteContext(method, `/api/notification-links/${token}`, {
      env: db.env,
      ...(body === undefined ? {} : { body }),
    }),
    token,
  );
}

beforeEach(() => {
  db = sqliteD1({ RESEND_API_KEY: 're_test', BETTER_AUTH_SECRET: SECRET });
  db.sql
    .prepare(
      'INSERT INTO documents (id, owner_id, name, saved_at, created_at, shareable) VALUES (?, ?, ?, ?, ?, 0)',
    )
    .run('D', 'owner', 'Plan', T, T);
  info.mockClear();
});

const token = () => noticeLinkToken(db.env, { ownerId: 'ada', documentId: 'D' }) as Promise<string>;

describe('the signed settings link', () => {
  it('reads the document and the person’s setting, writing nothing', async () => {
    const res = await call('GET', await token());
    expect(await res.json()).toEqual({
      documentName: 'Plan',
      setting: { comments: 'for-you', edits: 'none' },
    });
    expect(info.mock.calls.flat().join(' ')).not.toContain('[text-document-notices]');
  });

  it('keeps a setting for that person and document alone', async () => {
    await writeNoticeSetting(db.env, 'D', 'bo', { comments: 'all', edits: 'none' }, T);
    const res = await call('PUT', await token(), { comments: 'none', edits: 'added-or-removed' });
    expect(res.status).toBe(200);
    expect(await readNoticeSetting(db.env, 'D', 'ada')).toEqual({
      comments: 'none',
      edits: 'added-or-removed',
    });
    expect(await readNoticeSetting(db.env, 'D', 'bo')).toEqual({ comments: 'all', edits: 'none' });
    expect(info).toHaveBeenCalledWith(
      '[text-document-notices] setting saved from an email doc=D comments=none edits=added-or-removed one-click=false',
    );
  });

  it('turns both off with one click (RFC 8058)', async () => {
    const res = await call('POST', await token());
    expect(await res.json()).toEqual({
      documentName: 'Plan',
      setting: { comments: 'none', edits: 'none' },
    });
  });

  it('refuses a body that names no setting', async () => {
    expect((await call('PUT', await token(), { comments: 'some' })).status).toBe(400);
  });

  it('refuses a bad token, a gone document, other methods, and a host without email', async () => {
    expect((await call('GET', 'forged.token')).status).toBe(404);
    const gone = (await noticeLinkToken(db.env, { ownerId: 'ada', documentId: 'nope' }))!;
    expect((await call('GET', gone)).status).toBe(404);
    expect((await call('DELETE', await token())).status).toBe(404);
    const good = await token();
    db.env.RESEND_API_KEY = undefined;
    expect(await (await call('GET', good)).json()).toEqual({ error: 'link_not_found' });
  });
});
