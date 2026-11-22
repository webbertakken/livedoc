// docs/specs/006-document/blob-store.md "Where the bytes live" (what an owner holds is a row), "Getting bytes in"
// (usage), "Holds and retention" (usage counts each distinct key once per owner).
import { beforeEach, describe, expect, it } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { recordBlobUploadPart } from './blob-uploads';
import { blobObjectName, blobUsage, claimBlob, heldBlob, markBlobStored } from './blobs';

const KEY = 'a'.repeat(64) as BlobKey;
const OTHER = 'b'.repeat(64) as BlobKey;
const T0 = 1_800_000_000_000;

let db: SqliteD1;
beforeEach(() => {
  db = sqliteD1();
});

describe('what an owner holds', () => {
  it('names a new blob’s object by the owner it is stored for, its key and a mark of its own', async () => {
    expect(blobObjectName('ada', KEY, 'mark')).toBe(`ada/${KEY}.mark`);
    const first = await claimBlob(db.env, 'ada', KEY, 40, T0);
    expect(first.startsWith(`ada/${KEY}.`)).toBe(true);
    expect(first.slice(`ada/${KEY}.`.length)).toMatch(/^[0-9a-f]{8}$/);
    // A key claimed again after its row went (the sweep's delete) is another object.
    db.sql.prepare('DELETE FROM blobs').run();
    expect(await claimBlob(db.env, 'ada', KEY, 40, T0)).not.toBe(first);
  });

  // "The row is written before the first byte, as a claim, and is held only once storage has taken the bytes."
  it('holds nothing by a claim alone, and the blob once it is stored', async () => {
    expect(await heldBlob(db.env, 'ada', KEY)).toBeNull();
    const object = await claimBlob(db.env, 'ada', KEY, 40, T0);
    expect(await heldBlob(db.env, 'ada', KEY)).toBeNull();
    await markBlobStored(db.env, 'ada', KEY, 40, T0 + 5);
    expect(await heldBlob(db.env, 'ada', KEY)).toEqual({ size: 40, object });
    expect(await heldBlob(db.env, 'grace', KEY)).toBeNull();
  });

  it('renews a claim made again, with the size now said', async () => {
    const object = await claimBlob(db.env, 'ada', KEY, 1, T0);
    expect(await claimBlob(db.env, 'ada', KEY, 40, T0 + 9)).toBe(object);
    const row = db.sql.prepare('SELECT size, claimed_at, stored_at FROM blobs').get();
    expect({ ...row }).toEqual({ size: 40, claimed_at: T0 + 9, stored_at: null });
  });

  it('leaves a held blob as it is when its key is claimed again', async () => {
    const object = await claimBlob(db.env, 'ada', KEY, 40, T0);
    await markBlobStored(db.env, 'ada', KEY, 40, T0 + 5);
    expect(await claimBlob(db.env, 'ada', KEY, 7, T0 + 9)).toBe(object);
    await markBlobStored(db.env, 'ada', KEY, 7, T0 + 10);
    const row = db.sql.prepare('SELECT size, claimed_at, stored_at FROM blobs').get();
    expect({ ...row }).toEqual({ size: 40, claimed_at: T0, stored_at: T0 + 5 });
  });

  // A guest who signed up: the row is the account's, the object still named for the guest.
  it('answers the object a moved row names, never one made from its owner now', async () => {
    const object = await claimBlob(db.env, 'guest', KEY, 40, T0);
    await markBlobStored(db.env, 'guest', KEY, 40, T0);
    db.sql.prepare("UPDATE blobs SET owner_id = 'ada'").run();
    expect(object.startsWith('guest/')).toBe(true);
    expect(await heldBlob(db.env, 'ada', KEY)).toEqual({ size: 40, object });
    expect(await claimBlob(db.env, 'ada', KEY, 40, T0)).toBe(object);
  });
});

describe('an upload in parts', () => {
  it('answers no parts for an upload that went while its part was stored', async () => {
    expect(await recordBlobUploadPart(db.env, 'gone', 1, 'etag')).toEqual([]);
  });
});

describe('usage', () => {
  it('counts each held key once for its owner, and claims never', async () => {
    expect(await blobUsage(db.env, 'ada')).toEqual({ bytes: 0, blobs: 0 });
    for (const [owner, key, size] of [
      ['ada', KEY, 40],
      ['ada', OTHER, 2],
      ['grace', KEY, 40],
    ] as const) {
      await claimBlob(db.env, owner, key, size, T0);
      await markBlobStored(db.env, owner, key, size, T0);
    }
    await claimBlob(db.env, 'ada', 'c'.repeat(64) as BlobKey, 1_000, T0);
    expect(await blobUsage(db.env, 'ada')).toEqual({ bytes: 42, blobs: 2 });
    expect(await blobUsage(db.env, 'grace')).toEqual({ bytes: 40, blobs: 1 });
  });
});
