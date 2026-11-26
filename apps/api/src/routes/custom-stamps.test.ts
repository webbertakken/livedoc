// docs/specs/035-pdf-documents/custom-stamps.md "API": a person's own stamps, owner-scoped, each refusal by name.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import { PDF_CUSTOM_STAMPS_MAX, PDF_STAMP_MAX_BYTES } from '@livedoc/pdf-documents';
import { claimBlob, heldBlob, markBlobStored } from '../db';
import { testImagesBucket, type TestImagesBucket } from '../test-images-bucket';
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

  // custom-stamps.md "Making one": Show who and when, kept with it; a stamp made without it lists without it.
  it('keeps whether it shows who and when', async () => {
    expect((await make({ dynamic: true })).status).toBe(201);
    await make({ id: OTHER_ID, name: 'Due' });
    const listed = await (
      await call('GET', '/api/custom-stamps')
    ).json<{ stamps: { id: string; dynamic?: boolean }[] }>();
    expect(listed.stamps.find((s) => s.id === ID)).toMatchObject({ dynamic: true });
    expect(listed.stamps.find((s) => s.id === OTHER_ID)).not.toHaveProperty('dynamic');
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

// custom-stamps.md "API": its picture read back by its owner alone, typed, kept by the browser as a blob is.
describe('reading a custom stamp’s picture', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  let bucket: TestImagesBucket;
  beforeEach(async () => {
    bucket = testImagesBucket();
    db.env.FILES = bucket;
    await make();
  });

  const stored = async () => {
    const row = await heldBlob(db.env, 'ada', KEY);
    await bucket.put(row!.object, PNG);
  };

  it('answers its bytes, typed as its picture', async () => {
    await stored();
    const read = await call('GET', `/api/custom-stamps/${ID}/picture`);
    expect(read.status).toBe(200);
    expect(read.headers.get('Content-Type')).toBe('image/png');
    expect(read.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(read.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
    expect(read.headers.get('ETag')).toBe(`"${KEY}"`);
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(PNG);
  });

  it('reads another’s as custom_stamp_not_found', async () => {
    await stored();
    const refused = await call('GET', `/api/custom-stamps/${ID}/picture`, { owner: 'bo' });
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ error: 'custom_stamp_not_found' });
  });

  it('answers blob_missing where storage no longer has it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const refused = await call('GET', `/api/custom-stamps/${ID}/picture`);
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ error: 'blob_missing' });
  });

  it('answers nothing else at the picture', async () => {
    expect((await call('DELETE', `/api/custom-stamps/${ID}/picture`)).status).toBe(404);
  });
});

// custom-stamps.md "Managing them": a category renamed or deleted as one request, the owner's alone.
describe('a category of custom stamps', () => {
  const THIRD = 'custom-2b7c3c2e-5a8f-4f21-9a43-1f2d3e4c5b6a';
  beforeEach(async () => {
    await make();
    await make({ id: OTHER_ID, name: 'Due' });
    await make({ id: THIRD, name: 'Void', category: 'Bills' });
  });
  const categories = async (owner = 'ada') =>
    (
      await (
        await call('GET', '/api/custom-stamps', { owner })
      ).json<{
        stamps: { id: string; category: string }[];
      }>()
    ).stamps.map((s) => `${s.id.slice(7, 8)}:${s.category}`);

  it('is renamed for every stamp in it, answering theirs', async () => {
    const renamed = await call('PATCH', '/api/custom-stamps/categories/Accounts', {
      body: { category: ' Ledger ' },
    });
    expect(renamed.status).toBe(200);
    const { stamps } = await renamed.json<{ stamps: { category: string }[] }>();
    expect(stamps.map((s) => s.category).sort()).toEqual(['Bills', 'Ledger', 'Ledger']);
    expect((await categories()).sort()).toEqual(['0:Ledger', '1:Ledger', '2:Bills']);
  });

  it('merges into another of theirs when renamed onto it', async () => {
    await call('PATCH', '/api/custom-stamps/categories/Bills', { body: { category: 'Accounts' } });
    expect(new Set((await categories()).map((c) => c.split(':')[1]))).toEqual(
      new Set(['Accounts']),
    );
  });

  it('is deleted with every stamp in it, answering what is left', async () => {
    const deleted = await call('DELETE', '/api/custom-stamps/categories/Accounts');
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({ stamps: [{ id: THIRD }] });
  });

  it('reads a category name escaped in the path', async () => {
    await make({ id: 'custom-3b7c3c2e-5a8f-4f21-9a43-1f2d3e4c5b6a', category: 'A/B & C' });
    const deleted = await call(
      'DELETE',
      `/api/custom-stamps/categories/${encodeURIComponent('A/B & C')}`,
    );
    expect(deleted.status).toBe(200);
  });

  it('refuses another’s or none as custom_stamp_category_not_found, and a bad name as invalid', async () => {
    for (const [method, owner] of [
      ['DELETE', 'bo'],
      ['PATCH', 'bo'],
    ] as const) {
      const refused = await call(method, '/api/custom-stamps/categories/Accounts', {
        owner,
        body: { category: 'Mine' },
      });
      expect(refused.status).toBe(404);
      expect(await refused.json()).toEqual({ error: 'custom_stamp_category_not_found' });
    }
    const invalid = await call('PATCH', '/api/custom-stamps/categories/Accounts', {
      body: { category: '' },
    });
    expect(invalid.status).toBe(400);
    expect(await categories()).toHaveLength(3);
  });
});
