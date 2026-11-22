// docs/specs/006-document/blob-store.md "Where the bytes live": "A row is given, never bytes".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobKeyOf, type BlobKey } from '@livedoc/document';
import { testFilesBucket, type TestFilesBucket } from '../blob-store/test-files-bucket';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import {
  blobGiveBytes,
  blobGiveCopyStatements,
  blobGiveOwnerChangeStatement,
  blobKeysOfTabData,
} from './blob-gives';
import { blobUsage, claimBlob, heldBlob, markBlobStored } from './blobs';

const PDF = Uint8Array.from(new TextEncoder().encode('%PDF-1.7\na file given\n%%EOF\n'));
const NOW = 1_800_000_000_000;

let db: SqliteD1;
let bucket: TestFilesBucket;
let key: BlobKey;

beforeEach(async () => {
  db = sqliteD1();
  bucket = testFilesBucket();
  db.env.FILES = bucket;
  key = await blobKeyOf(PDF);
});
afterEach(() => vi.restoreAllMocks());

const keyOf = (n: number) => n.toString(16).padStart(64, '0') as BlobKey;

async function stored(owner: string, of: BlobKey = key, size = PDF.byteLength): Promise<string> {
  const object = await claimBlob(db.env, owner, of, size, NOW);
  await bucket.put(object, PDF);
  await markBlobStored(db.env, owner, of, size, NOW);
  return object;
}

const document = (id: string, owner: string, team: string | null = null) =>
  db.sql
    .prepare(
      `INSERT INTO documents (id, owner_id, team_id, name, shareable, saved_at, created_at)
       VALUES (?, ?, ?, 'Doc', 0, 1, 1)`,
    )
    .run(id, owner, team);

const hold = (documentId: string, of: BlobKey, until: number | null = null) =>
  db.sql
    .prepare('INSERT INTO document_blobs (document_id, tab_id, key, until) VALUES (?, ?, ?, ?)')
    .run(documentId, `t-${of.slice(-4)}`, of, until);

describe('the keys a copied tab names', () => {
  it('is a PDF tab’s stored file', () => {
    const data = JSON.stringify({ kind: 'pdf', elements: [], blob: key, size: 10 });
    expect(blobKeysOfTabData(data)).toEqual([key]);
  });

  it('is none for another kind, a tab naming no key, and a body that does not parse', () => {
    expect(blobKeysOfTabData(JSON.stringify({ elements: [] }))).toEqual([]);
    expect(blobKeysOfTabData(JSON.stringify({ kind: 'pdf', blob: 'nope', size: 1 }))).toEqual([]);
    expect(blobKeysOfTabData('{"kind" nope')).toEqual([]);
  });
});

describe('a copy by someone else', () => {
  const give = (to: string, keys: BlobKey[] = [key]) =>
    db.env.DB.batch(blobGiveCopyStatements(db.env, 'src', to, keys, NOW + 5));

  it('gives the copier a row naming the object the bytes are already in', async () => {
    document('src', 'ada');
    const object = await stored('ada');
    await give('bob');
    expect(await heldBlob(db.env, 'bob', key)).toEqual({ size: PDF.byteLength, object });
    // The original owner's row is as it was, and no byte moved.
    expect(await heldBlob(db.env, 'ada', key)).toEqual({ size: PDF.byteLength, object });
    expect([...bucket.objects.keys()]).toEqual([object]);
  });

  it('counts in the copier’s usage from then on', async () => {
    document('src', 'ada');
    await stored('ada');
    await give('bob');
    expect(await blobUsage(db.env, 'bob')).toEqual({ bytes: PDF.byteLength, blobs: 1 });
  });

  it('leaves a key the copier already holds as it is', async () => {
    document('src', 'ada');
    await stored('ada');
    const own = await stored('bob');
    await give('bob');
    expect((await heldBlob(db.env, 'bob', key))?.object).toBe(own);
  });

  it('makes a claim of the copier’s not yet stored the given row', async () => {
    document('src', 'ada');
    const object = await stored('ada');
    await claimBlob(db.env, 'bob', key, PDF.byteLength, NOW);
    expect(await heldBlob(db.env, 'bob', key)).toBeNull();
    await give('bob');
    expect(await heldBlob(db.env, 'bob', key)).toEqual({ size: PDF.byteLength, object });
  });

  it('gives nothing the source’s owner does not hold, and nothing for no keys', async () => {
    document('src', 'ada');
    // A claim of the owner's never stored is not a blob.
    await claimBlob(db.env, 'ada', key, PDF.byteLength, NOW);
    await give('bob');
    expect(await heldBlob(db.env, 'bob', key)).toBeNull();
    expect(blobGiveCopyStatements(db.env, 'src', 'bob', [], NOW)).toEqual([]);
  });

  it('gives the owner nothing for a copy of their own document', async () => {
    document('src', 'ada');
    const object = await stored('ada');
    await give('ada');
    expect(await heldBlob(db.env, 'ada', key)).toEqual({ size: PDF.byteLength, object });
    expect(await blobUsage(db.env, 'ada')).toEqual({ bytes: PDF.byteLength, blobs: 1 });
  });

  it('says how many bytes a copy would add to the copier’s usage', async () => {
    document('src', 'ada');
    const other = keyOf(7);
    await stored('ada');
    await stored('ada', other, 400);
    expect(await blobGiveBytes(db.env, 'src', 'bob', [key, other])).toBe(PDF.byteLength + 400);
    // What the copier holds already adds nothing; nor does the owner's own copy, or no key at all.
    await stored('bob');
    expect(await blobGiveBytes(db.env, 'src', 'bob', [key, other])).toBe(400);
    expect(await blobGiveBytes(db.env, 'src', 'ada', [key, other])).toBe(0);
    expect(await blobGiveBytes(db.env, 'src', 'bob', [])).toBe(0);
  });
});

describe('a document passing to another owner', () => {
  const pass = (to: string, where: string, params: (string | number | null)[]) =>
    blobGiveOwnerChangeStatement(db.env, to, where, params, NOW + 5).run();

  it('gives the new owner every key the document has told it holds, previous versions too', async () => {
    document('d', 'ada', 'team');
    const earlier = keyOf(3);
    const object = await stored('ada');
    const before = await stored('ada', earlier);
    hold('d', key);
    hold('d', earlier, NOW + 1000);
    const res = await pass('bob', 'd.owner_id = ?3 AND d.team_id = ?4', ['ada', 'team']);
    expect(res.meta.changes).toBe(2);
    expect((await heldBlob(db.env, 'bob', key))?.object).toBe(object);
    expect((await heldBlob(db.env, 'bob', earlier))?.object).toBe(before);
  });

  it('gives nothing of the documents it does not pick, and nothing the owner holds besides', async () => {
    document('d', 'ada', 'team');
    document('own', 'ada');
    const other = keyOf(9);
    await stored('ada');
    await stored('ada', other);
    hold('own', other);
    await pass('bob', 'd.owner_id = ?3 AND d.team_id = ?4', ['ada', 'team']);
    expect(await heldBlob(db.env, 'bob', other)).toBeNull();
    expect(await heldBlob(db.env, 'bob', key)).toBeNull();
  });

  it('gives a key two documents hold once', async () => {
    document('d1', 'ada');
    document('d2', 'ada');
    await stored('ada');
    hold('d1', key);
    hold('d2', key);
    await pass('bob', 'd.owner_id = ?3', ['ada']);
    expect(await blobUsage(db.env, 'bob')).toEqual({ bytes: PDF.byteLength, blobs: 1 });
  });

  it('gives nothing when the document is the new owner’s already', async () => {
    document('d', 'ada');
    await stored('ada');
    hold('d', key);
    const res = await pass('ada', 'd.id = ?3', ['d']);
    expect(res.meta.changes).toBe(0);
  });
});
