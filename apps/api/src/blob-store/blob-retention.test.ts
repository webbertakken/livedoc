// docs/specs/006-document/blob-store.md "Holds and retention" (each document tells what it holds; the sweep keeps
// bytes whenever in doubt), "Getting bytes in" (an unfinished upload is forgotten), "Where the bytes live".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  blobKeyOf,
  FILE_UNHELD_GRACE_HOURS,
  FILE_UPLOAD_ABANDON_HOURS,
  type BlobKey,
} from '@livedoc/document';
import { claimBlob, deleteAccount, heldBlob, markBlobStored, migrateOwnerId } from '../db';
import { handleBlobStoreRoutes } from '../routes/blob-store-routes';
import { handleDocuments } from '../routes/documents';
import { makeTestRouteContext } from '../routes/test-route-context';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import {
  blobSweepTripped,
  FILE_SWEEP_PAGE,
  FILE_SWEEP_TRIPPED_MAX,
  FILE_SWEEP_TRIPWIRE_MIN,
  sweepBlobs,
} from './blob-retention';
import { tabBlobHolds } from './tab-blobs';
import { testFilesBucket, type TestFilesBucket } from './test-files-bucket';

const PDF = Uint8Array.from(new TextEncoder().encode('%PDF-1.7\na file to keep\n%%EOF\n'));
const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const OLD = NOW - (FILE_UNHELD_GRACE_HOURS + 1) * HOUR;

let db: SqliteD1;
let bucket: TestFilesBucket;
let key: BlobKey;

beforeEach(async () => {
  db = sqliteD1();
  bucket = testFilesBucket();
  db.env.FILES = bucket;
  key = await blobKeyOf(PDF);
  for (const level of ['warn', 'info', 'log'] as const)
    vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const keyOf = (n: number) => n.toString(16).padStart(64, '0') as BlobKey;

// A blob stored for the owner at that time, with bytes in the bucket.
async function stored(owner: string, of: BlobKey, at: number): Promise<string> {
  const object = await claimBlob(db.env, owner, of, PDF.byteLength, at);
  await bucket.put(object, PDF);
  await markBlobStored(db.env, owner, of, PDF.byteLength, at);
  return object;
}

const pdfTab = (blob: string = key) => ({
  id: 't1',
  name: 'Contract',
  kind: 'pdf',
  elements: [],
  blob,
  size: PDF.byteLength,
});

function documents(method: string, path: string, body?: unknown, owner = 'ada') {
  return handleDocuments(
    makeTestRouteContext(method, path, { env: db.env, owner, ...(body ? { body } : {}) }),
  );
}

const create = async (id = 'D', owner = 'ada') => {
  const res = await documents('POST', '/api/documents', { id, name: id, tabs: [pdfTab()] }, owner);
  expect(res.status).toBe(201);
  // The test database drains before each D1 call, so the create's own drain ran before its D1 row was there (a
  // room's alarm drains two seconds after the write): a save of the tab queues it again.
  const saved = await documents('PUT', `/api/documents/${id}/tabs/t1`, pdfTab(), owner);
  expect(saved.status).toBe(200);
  await db.flush();
};

const holds = () =>
  db.sql
    .prepare('SELECT document_id, tab_id, key, until FROM document_blobs ORDER BY document_id')
    .all()
    .map((row) => ({ ...row }));
const sweep = () => sweepBlobs(db.env, NOW);

describe('what a tab holds', () => {
  it('is a PDF tab’s stored file, for as long as the tab names it', () => {
    expect(tabBlobHolds(pdfTab())).toEqual([{ key, until: null }]);
    expect(tabBlobHolds({ ...pdfTab(), blob: 'not a key' })).toEqual([]);
  });

  it('is each picture its marks name, as the tab’s own', () => {
    expect(tabBlobHolds(pdfTab(), [], [keyOf(7), key])).toEqual([
      { key: keyOf(7), until: null },
      { key, until: null },
    ]);
  });

  it('is nothing to tell for a tab of a kind that never holds a blob', () => {
    expect(tabBlobHolds({ kind: 'text-document' })).toBeNull();
    expect(tabBlobHolds({})).toBeNull();
  });
});

describe('each document tells what it holds', () => {
  it('pushes the key a PDF tab names, and lets go of it with the tab', async () => {
    await stored('ada', key, OLD);
    await create();
    expect(holds()).toEqual([{ document_id: 'D', tab_id: 't1', key, until: null }]);
    const board = { id: 't2', name: 'Board', elements: [] };
    expect((await documents('PUT', '/api/documents/D/tabs/t2', board)).status).toBe(200);
    expect((await documents('DELETE', '/api/documents/D/tabs/t1')).status).toBe(204);
    await db.flush();
    expect(holds()).toEqual([]);
  });

  it('tells nothing for a document without a PDF tab', async () => {
    const board = { id: 'B', name: 'Board', tabs: [{ id: 't0', name: 'Board', elements: [] }] };
    expect((await documents('POST', '/api/documents', board)).status).toBe(201);
    await db.flush();
    expect(holds()).toEqual([]);
  });
});

describe('the sweep', () => {
  it('keeps a blob a tab holds, however old', async () => {
    await stored('ada', key, OLD);
    await create();
    expect(await sweep()).toEqual({ blobs: 0, uploads: 0 });
    expect(await heldBlob(db.env, 'ada', key)).not.toBeNull();
    expect(bucket.objects.size).toBe(1);
  });

  // "A blob no longer held is deleted by the retention sweep after FILE_UNHELD_GRACE_HOURS, so an upload finished
  // moments before its tab names it is never swept."
  it('deletes a blob nothing holds once its grace has passed, never before', async () => {
    await stored('ada', key, OLD);
    await stored('ada', keyOf(2), NOW - HOUR);
    expect(await sweep()).toEqual({ blobs: 1, uploads: 0 });
    expect(await heldBlob(db.env, 'ada', key)).toBeNull();
    expect(await heldBlob(db.env, 'ada', keyOf(2))).not.toBeNull();
    expect(bucket.blob('ada', key)).toBeUndefined();
    expect(bucket.objects.size).toBe(1);
  });

  // custom-stamps.md "Where they are kept": a custom stamp holds its picture while it is kept.
  it('keeps the picture a custom stamp holds, and sweeps it once the stamp is deleted', async () => {
    await stored('ada', key, OLD);
    db.sql
      .prepare(
        `INSERT INTO custom_stamps (id, owner_id, name, category, picture_key, picture_type, width, height,
           natural_width, natural_height, created_at, updated_at)
         VALUES ('cs', 'ada', 'Paid', 'Custom', ?, 'png', 4, 4, 3, 3, 1, 1)`,
      )
      .run(key);
    expect(await sweep()).toEqual({ blobs: 0, uploads: 0 });
    expect(await heldBlob(db.env, 'ada', key)).not.toBeNull();
    db.sql.prepare('DELETE FROM custom_stamps').run();
    expect(await sweep()).toEqual({ blobs: 1, uploads: 0 });
    expect(await heldBlob(db.env, 'ada', key)).toBeNull();
  });

  it('deletes the blob of a purged document, whose holds went with it', async () => {
    await stored('ada', key, OLD);
    await create();
    db.sql.prepare("DELETE FROM documents WHERE id = 'D'").run();
    expect(await sweep()).toEqual({ blobs: 1, uploads: 0 });
    expect(bucket.objects.size).toBe(0);
  });

  it('keeps a previous version until its day, and deletes it after', async () => {
    await stored('ada', key, OLD);
    await stored('ada', keyOf(2), OLD);
    await create();
    const hold = db.sql.prepare(
      "INSERT INTO document_blobs (document_id, tab_id, key, until) VALUES ('D', 't1', ?, ?)",
    );
    hold.run(keyOf(2), NOW + 1);
    expect((await sweep()).blobs).toBe(0);
    db.sql.prepare('UPDATE document_blobs SET until = ? WHERE key = ?').run(NOW, keyOf(2));
    expect((await sweep()).blobs).toBe(1);
    expect(await heldBlob(db.env, 'ada', keyOf(2))).toBeNull();
    expect(await heldBlob(db.env, 'ada', key)).not.toBeNull();
  });

  it('holds a key only for the owner of the document that names it', async () => {
    await stored('ada', key, OLD);
    await stored('grace', key, OLD);
    await create('D', 'ada');
    expect((await sweep()).blobs).toBe(1);
    expect(await heldBlob(db.env, 'ada', key)).not.toBeNull();
    expect(await heldBlob(db.env, 'grace', key)).toBeNull();
  });

  // "waits while any document has not pushed yet"
  it('waits while any document has not pushed what it holds', async () => {
    await stored('ada', key, OLD);
    db.sql
      .prepare(
        "INSERT INTO documents (id, owner_id, name, saved_at, created_at, shareable) VALUES ('X', 'ada', 'X', 1, 1, 0)",
      )
      .run();
    await db.flush();
    db.sql.prepare("UPDATE documents SET content_summary = NULL WHERE id = 'X'").run();
    expect((await sweep()).blobs).toBe(0);
    expect(console.log).toHaveBeenCalledWith('[blob-store] sweep-paused documents=1');
    expect(bucket.objects.size).toBe(1);
  });

  // "a run that would delete more than half of the old blobs, and more than FILE_SWEEP_TRIPWIRE_MIN of them,
  // deletes at most FILE_SWEEP_TRIPPED_MAX, oldest first, and logs an error"
  it('is slowed by the tripwire, deleting the oldest first', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const count = FILE_SWEEP_TRIPPED_MAX + 5;
    const insert = db.sql.prepare(
      'INSERT INTO blobs (owner_id, key, size, object, claimed_at, stored_at) VALUES (?, ?, 1, ?, ?, ?)',
    );
    for (let n = 0; n < count; n++)
      insert.run('ada', keyOf(n), `ada/${keyOf(n)}.0`, OLD - n, OLD - n);
    expect((await sweep()).blobs).toBe(FILE_SWEEP_TRIPPED_MAX);
    expect(error).toHaveBeenCalledWith(
      `[blob-store] sweep-tripwire unheld=${count} old=${count}; deleting at most ${FILE_SWEEP_TRIPPED_MAX}, oldest first`,
    );
    // The five newest are left.
    const left = db.sql.prepare('SELECT key FROM blobs ORDER BY stored_at DESC').all();
    expect(left.map((row) => row.key)).toEqual([0, 1, 2, 3, 4].map(keyOf));
  });

  it('goes on page after page, and ends on a page that deletes nothing', async () => {
    const insert = db.sql.prepare(
      'INSERT INTO blobs (owner_id, key, size, object, claimed_at, stored_at) VALUES (?, ?, 1, ?, ?, ?)',
    );
    db.sql
      .prepare(
        "INSERT INTO documents (id, owner_id, name, saved_at, created_at, shareable) VALUES ('H', 'ada', 'H', 1, 1, 0)",
      )
      .run();
    await db.flush();
    const hold = db.sql.prepare(
      "INSERT INTO document_blobs (document_id, tab_id, key) VALUES ('H', 't1', ?)",
    );
    // One more unheld than a page, and as many held, so the wire is not tripped.
    for (let n = 0; n <= FILE_SWEEP_PAGE; n++) {
      insert.run('ada', keyOf(n), `ada/${keyOf(n)}.0`, OLD, OLD);
      insert.run('ada', keyOf(n + 5_000), `ada/${keyOf(n + 5_000)}.0`, OLD, OLD);
      hold.run(keyOf(n + 5_000));
    }
    expect((await sweep()).blobs).toBe(FILE_SWEEP_PAGE + 1);
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM blobs').get()?.n).toBe(FILE_SWEEP_PAGE + 1);
  });

  it('trips only past the least count and past half of the old blobs', () => {
    expect(blobSweepTripped(100, FILE_SWEEP_TRIPWIRE_MIN)).toBe(false);
    expect(blobSweepTripped(30, FILE_SWEEP_TRIPWIRE_MIN + 1)).toBe(true);
    expect(blobSweepTripped(100, 50)).toBe(false);
    expect(blobSweepTripped(100, 51)).toBe(true);
  });

  it('keeps an object another owner’s row still names', async () => {
    const object = await stored('guest', key, OLD);
    db.sql
      .prepare(
        "INSERT INTO blobs (owner_id, key, size, object, claimed_at, stored_at) VALUES ('ada', ?, ?, ?, ?, ?)",
      )
      .run(key, PDF.byteLength, object, NOW, NOW);
    expect((await sweep()).blobs).toBe(1);
    expect(bucket.objects.has(object)).toBe(true);
    expect(await heldBlob(db.env, 'ada', key)).toEqual({ size: PDF.byteLength, object });
  });

  it('keeps the rows gone and logs when object storage does not delete', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await stored('ada', key, OLD);
    bucket.delete = () => Promise.reject(new Error('delete: internal error'));
    expect((await sweep()).blobs).toBe(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(bucket.objects.size).toBe(1);
  });

  it('does nothing without the bucket', async () => {
    await stored('ada', key, OLD);
    delete db.env.FILES;
    expect(await sweep()).toEqual({ blobs: 0, uploads: 0 });
    expect(await heldBlob(db.env, 'ada', key)).not.toBeNull();
  });
});

describe('unfinished uploads and claims', () => {
  const begin = async (owner = 'ada') => {
    const res = await handleBlobStoreRoutes(
      makeTestRouteContext('POST', `/api/files/${key}/uploads?size=${PDF.byteLength}`, {
        env: db.env,
        owner,
      }),
    );
    return (await res.json<{ upload: string }>()).upload;
  };
  const age = (table: string, column: string, at: number) =>
    db.sql.prepare(`UPDATE ${table} SET ${column} = ?`).run(at);
  const ABANDONED = NOW - (FILE_UPLOAD_ABANDON_HOURS + 1) * HOUR;

  // "An unfinished upload is forgotten after FILE_UPLOAD_ABANDON_HOURS; its parts count for nothing."
  it('forgets an upload past its day, with its parts and its claim', async () => {
    await begin();
    expect(bucket.uploads.size).toBe(1);
    age('blob_uploads', 'begun_at', ABANDONED);
    age('blobs', 'claimed_at', ABANDONED);
    expect(await sweep()).toEqual({ blobs: 0, uploads: 1 });
    expect(bucket.uploads.size).toBe(0);
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM blob_uploads').get()?.n).toBe(0);
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM blobs').get()?.n).toBe(0);
  });

  it('keeps an upload that can still be resumed, and its claim', async () => {
    await begin();
    age('blob_uploads', 'begun_at', NOW - HOUR);
    age('blobs', 'claimed_at', ABANDONED);
    expect(await sweep()).toEqual({ blobs: 0, uploads: 0 });
    expect(bucket.uploads.size).toBe(1);
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM blobs').get()?.n).toBe(1);
  });

  it('forgets a claim never stored, and whatever storage has under it', async () => {
    const object = await claimBlob(db.env, 'ada', key, PDF.byteLength, ABANDONED);
    await bucket.put(object, PDF);
    await sweep();
    expect(bucket.objects.size).toBe(0);
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM blobs').get()?.n).toBe(0);
  });

  it('keeps an upload whose parts storage would not let go of, for the next run', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await begin();
    age('blob_uploads', 'begun_at', ABANDONED);
    bucket.delete = () => Promise.reject(new Error('delete: internal error'));
    await sweep();
    expect(error).toHaveBeenCalled();
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM blob_uploads').get()?.n).toBe(1);
  });
});

describe('an owner who signs up or leaves', () => {
  // "A guest who signs up takes their rows with them, so no byte moves; a key the account already held stays the
  // account's, and the guest's row is swept."
  it('moves a guest’s blobs to the account, and sweeps the one the account already held', async () => {
    const guests = await stored('guest', key, OLD);
    await stored('guest', keyOf(2), OLD);
    const accounts = await stored('account', keyOf(2), OLD);
    await create('D', 'guest');
    await migrateOwnerId(db.env, 'guest', 'account');
    await db.flush();
    expect(await heldBlob(db.env, 'account', key)).toEqual({
      size: PDF.byteLength,
      object: guests,
    });
    expect((await heldBlob(db.env, 'account', keyOf(2)))?.object).toBe(accounts);
    // The guest's twin is held by nothing; the account's own is unheld too, and both are past their grace.
    expect((await sweep()).blobs).toBe(2);
    expect(await heldBlob(db.env, 'account', key)).not.toBeNull();
    expect([...bucket.objects.keys()]).toEqual([guests]);
  });

  it('deletes everything a closing account holds, and aborts its uploads', async () => {
    await stored('ada', key, OLD);
    await stored('grace', key, OLD);
    await handleBlobStoreRoutes(
      makeTestRouteContext('POST', `/api/files/${keyOf(3)}/uploads?size=9`, {
        env: db.env,
        owner: 'ada',
      }),
    );
    await deleteAccount(db.env, 'ada');
    expect(db.sql.prepare("SELECT COUNT(*) AS n FROM blobs WHERE owner_id = 'ada'").get()?.n).toBe(
      0,
    );
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM blob_uploads').get()?.n).toBe(0);
    expect(bucket.uploads.size).toBe(0);
    expect(bucket.blob('ada', key)).toBeUndefined();
    expect(bucket.blob('grace', key)).toEqual(PDF);
  });
});
