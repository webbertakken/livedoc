// docs/specs/035-pdf-documents/custom-stamps.md "API": a person's own stamps, owner-scoped, each refusal by name.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import { PDF_CUSTOM_STAMPS_MAX, PDF_STAMP_MAX_BYTES } from '@livedoc/pdf-documents';
import { claimBlob, markBlobStored } from '../db';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { handleCustomStamps } from './custom-stamps';
import { makeTestRouteContext } from './test-route-context';

const KEY = 'a'.repeat(64) as BlobKey;
const ID = 'custom-0b7c3c2e-5a8f-4f21-9a43-1f2d3e4c5b6a';
const OTHER_ID = 'custom-1b7c3c2e-5a8f-4f21-9a43-1f2d3e4c5b6a';
const T0 = 1_800_000_000_000;

let db: SqliteD1;
beforeEach(async () => {
  db = sqliteD1();
  db.env.FILES = {} as R2Bucket;
  await hold('ada', KEY, 4_000);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

async function hold(owner: string, key: BlobKey, size: number) {
  await claimBlob(db.env, owner, key, size, T0);
  await markBlobStored(db.env, owner, key, size, T0);
}

const input = (over: Record<string, unknown> = {}) => ({
  id: ID,
  name: 'Paid',
  category: 'Accounts',
  picture: { key: KEY, type: 'png', width: 400, height: 200 },
  natural: { width: 300, height: 150 },
  ...over,
});

const call = (method: string, path: string, opts: { owner?: string; body?: unknown } = {}) =>
  handleCustomStamps(
    makeTestRouteContext(method, path, {
      env: db.env,
      owner: opts.owner ?? 'ada',
      body: opts.body,
    }),
  );

const make = (over: Record<string, unknown> = {}, owner = 'ada') =>
  call('POST', '/api/custom-stamps', { owner, body: input(over) });

describe('making a custom stamp', () => {
  it('keeps it for its owner and lists it, newest first', async () => {
    const made = await make();
    expect(made.status).toBe(201);
    const { stamp } = await made.json<{ stamp: { id: string; name: string } }>();
    expect(stamp).toMatchObject({ id: ID, name: 'Paid', category: 'Accounts' });
    await make({ id: OTHER_ID, name: 'Due' });
    const listed = await (
      await call('GET', '/api/custom-stamps')
    ).json<{ stamps: { id: string }[] }>();
    expect(listed.stamps.map((s) => s.id)).toEqual([OTHER_ID, ID]);
  });

  it('lists nobody else’s', async () => {
    await make();
    const listed = await (
      await call('GET', '/api/custom-stamps', { owner: 'bo' })
    ).json<{ stamps: unknown[] }>();
    expect(listed.stamps).toEqual([]);
  });

  it.each([
    ['an id of another form', { id: 'approved' }],
    ['an empty name', { name: ' ' }],
    ['a picture of another type', { picture: { key: KEY, type: 'gif', width: 4, height: 4 } }],
  ])('refuses %s as custom_stamp_invalid', async (_, over) => {
    const refused = await make(over);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: 'custom_stamp_invalid' });
  });

  it('refuses an id taken as custom_stamp_exists', async () => {
    await make();
    const again = await make();
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'custom_stamp_exists' });
  });

  it('refuses a picture the owner does not hold as custom_stamp_picture_missing', async () => {
    const refused = await make({}, 'bo');
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'custom_stamp_picture_missing' });
  });

  it('refuses a picture past the most as custom_stamp_picture_too_large', async () => {
    const big = 'b'.repeat(64) as BlobKey;
    await hold('ada', big, PDF_STAMP_MAX_BYTES + 1);
    const refused = await make({ picture: { key: big, type: 'png', width: 4, height: 4 } });
    expect(refused.status).toBe(413);
    expect(await refused.json()).toEqual({ error: 'custom_stamp_picture_too_large' });
  });

  it('refuses one past the most an owner keeps as too_many_custom_stamps', async () => {
    const insert = db.sql.prepare(
      `INSERT INTO custom_stamps (id, owner_id, name, category, picture_key, picture_type, width, height,
         natural_width, natural_height, created_at, updated_at)
       VALUES (?, 'ada', 'n', 'c', ?, 'png', 1, 1, 1, 1, 1, 1)`,
    );
    for (let n = 0; n < PDF_CUSTOM_STAMPS_MAX; n += 1) insert.run(`kept-${n}`, KEY);
    const refused = await make();
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'too_many_custom_stamps' });
  });

  it('refuses every request where the deployment has no file storage', async () => {
    delete db.env.FILES;
    const refused = await call('GET', '/api/custom-stamps');
    expect(refused.status).toBe(503);
    expect(await refused.json()).toEqual({ error: 'files_unavailable' });
  });
});

describe('changing and deleting one', () => {
  beforeEach(async () => {
    await make();
  });

  it('renames it and moves it to another category', async () => {
    const changed = await call('PATCH', `/api/custom-stamps/${ID}`, {
      body: { name: 'Settled', category: 'Bills' },
    });
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({
      stamp: { id: ID, name: 'Settled', category: 'Bills' },
    });
  });

  it('refuses a change of nothing as custom_stamp_invalid', async () => {
    const refused = await call('PATCH', `/api/custom-stamps/${ID}`, { body: {} });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: 'custom_stamp_invalid' });
  });

  it('deletes it', async () => {
    expect((await call('DELETE', `/api/custom-stamps/${ID}`)).status).toBe(204);
    const listed = await (await call('GET', '/api/custom-stamps')).json<{ stamps: unknown[] }>();
    expect(listed.stamps).toEqual([]);
  });

  it('reads another’s, or none, as custom_stamp_not_found', async () => {
    for (const [method, path, owner] of [
      ['PATCH', `/api/custom-stamps/${ID}`, 'bo'],
      ['DELETE', `/api/custom-stamps/${ID}`, 'bo'],
      ['DELETE', `/api/custom-stamps/${OTHER_ID}`, 'ada'],
    ] as const) {
      const refused = await call(method, path, { owner, body: { name: 'Mine' } });
      expect(refused.status).toBe(404);
      expect(await refused.json()).toEqual({ error: 'custom_stamp_not_found' });
    }
  });
});
