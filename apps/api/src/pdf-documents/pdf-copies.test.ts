// docs/specs/035-pdf-documents/live-editing-and-storage.md "Copies, the Trash and versions";
// docs/specs/006-document/blob-store.md "Where the bytes live" ("A row is given, never bytes").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobKeyOf, FILE_UNHELD_GRACE_HOURS, type BlobKey } from '@livedoc/document';
import { PdfLiveChanges } from '@livedoc/pdf-documents';
import { sweepBlobs } from '../blob-store/blob-retention';
import { testFilesBucket, type TestFilesBucket } from '../blob-store/test-files-bucket';
import { blobGiveCopyStatements } from '../db/blob-gives';
import { blobUsage, claimBlob, heldBlob, markBlobStored } from '../db/blobs';
import { setDocumentFolder } from '../db/documents';
import { createShareLink } from '../db/share';
import { createTeam, handTeamWorkToHeir } from '../db/teams';
import { purgeDocuments, restoreDocument, trashDocument } from '../db/trash';
import { appendLiveTabUpdate, readLiveTabState } from '../live-tabs/live-tab-store';
import { handleBlobStoreRoutes } from '../routes/blob-store-routes';
import { handleDocuments } from '../routes/documents';
import { makeTestRouteContext } from '../routes/test-route-context';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { PDF_LIVE_TAB } from './pdf-live-tab';

const PDF = Uint8Array.from(new TextEncoder().encode('%PDF-1.7\na file to copy\n%%EOF\n'));
const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const OLD = NOW - (FILE_UNHELD_GRACE_HOURS + 1) * HOUR;
const CODE = 'SHARE001';

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

async function stored(owner: string, at = OLD): Promise<string> {
  const object = await claimBlob(db.env, owner, key, PDF.byteLength, at);
  await bucket.put(object, PDF);
  await markBlobStored(db.env, owner, key, PDF.byteLength, at);
  return object;
}

const pdfTab = () => ({
  id: 't1',
  name: 'Contract',
  kind: 'pdf',
  elements: [],
  blob: key,
  size: PDF.byteLength,
});

type Sent = { owner?: string; body?: unknown; code?: string; account?: string };

function documents(method: string, path: string, sent: Sent = {}) {
  return handleDocuments(
    makeTestRouteContext(method, path, {
      env: db.env,
      owner: sent.owner ?? 'ada',
      ...(sent.account ? { sessionAccountId: sent.account } : {}),
      ...(sent.body ? { body: sent.body } : {}),
      ...(sent.code ? { headers: { 'X-Share-Code': sent.code } } : {}),
    }),
  );
}

// Ada's PDF document D, shared by a link; what it holds is pushed.
async function shared(): Promise<string> {
  const object = await stored('ada');
  const made = await documents('POST', '/api/documents', {
    body: { id: 'D', name: 'Contract', tabs: [pdfTab()] },
  });
  expect(made.status).toBe(201);
  // The test database drains before each D1 call, so a save of the tab queues what the create pushed.
  expect((await documents('PUT', '/api/documents/D/tabs/t1', { body: pdfTab() })).status).toBe(200);
  await db.flush();
  db.sql.exec("UPDATE documents SET shareable = 1 WHERE id = 'D'");
  await createShareLink(db.env, 'D', CODE, 'view');
  return object;
}

const copyAs = (owner: string) =>
  documents('POST', '/api/documents/D/copy', { owner, ...(owner === 'ada' ? {} : { code: CODE }) });

const read = (documentId: string, owner: string) =>
  documents('GET', `/api/documents/${documentId}/files/${key}`, { owner });

const tabIdOf = (documentId: string) =>
  db.sql.prepare('SELECT tab_id FROM document_tabs WHERE document_id = ?').get(documentId)
    ?.tab_id as string;

describe('someone else’s copy', () => {
  it('is given the stored file as a row, and reads it', async () => {
    const object = await shared();
    const res = await copyAs('bob');
    expect(res.status).toBe(201);
    const { document } = await res.json<{ document: { id: string; ownerId: string } }>();
    expect(document.ownerId).toBe('bob');
    expect(await heldBlob(db.env, 'bob', key)).toEqual({ size: PDF.byteLength, object });
    const file = await read(document.id, 'bob');
    expect(file.status).toBe(200);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PDF);
    // No byte moved: the bucket holds the one object.
    expect([...bucket.objects.keys()]).toEqual([object]);
    expect(console.info).toHaveBeenCalledWith(
      `[blob-store] given count=1 reason=copy document=${document.id}`,
    );
  });

  it('carries the live changes under the copy’s own tab', async () => {
    await shared();
    const changes = PdfLiveChanges.load();
    PdfLiveChanges.setStored(changes, { blob: key, pages: 3 });
    await appendLiveTabUpdate(db.env, PDF_LIVE_TAB, 't1', PdfLiveChanges.encode(changes));
    const { document } = await (await copyAs('bob')).json<{ document: { id: string } }>();
    const copied = PdfLiveChanges.load([
      await readLiveTabState(db.env, PDF_LIVE_TAB, tabIdOf(document.id)),
    ]);
    expect(PdfLiveChanges.stored(copied)).toEqual({ blob: key, pages: 3 });
  });

  it('opens after the original is purged and swept, and counts in the copier’s usage', async () => {
    const object = await shared();
    const { document } = await (await copyAs('bob')).json<{ document: { id: string } }>();
    // What the copy holds is pushed by its own room.
    const tab = { ...pdfTab(), id: tabIdOf(document.id) };
    const saved = await documents('PUT', `/api/documents/${document.id}/tabs/${tab.id}`, {
      owner: 'bob',
      body: tab,
    });
    expect(saved.status).toBe(200);
    await db.flush();
    await trashDocument(db.env, 'D', NOW);
    expect(await purgeDocuments(db.env, ['D'])).toBe(1);
    // Ada's row is held by nothing now, and past its grace; Bob's row was given a moment ago, and is held.
    expect((await sweepBlobs(db.env, NOW)).blobs).toBe(1);
    expect(await heldBlob(db.env, 'ada', key)).toBeNull();
    expect([...bucket.objects.keys()]).toEqual([object]);
    expect((await read(document.id, 'bob')).status).toBe(200);
    expect(await blobUsage(db.env, 'bob')).toEqual({ bytes: PDF.byteLength, blobs: 1 });
  });

  it('is refused when it would pass the copier’s allowance, and nothing is made', async () => {
    await shared();
    db.env.FILE_MAX_BYTES_PER_OWNER = String(PDF.byteLength - 1);
    const res = await copyAs('bob');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'usage_exceeded', leftBytes: PDF.byteLength - 1 });
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM documents').get()?.n).toBe(1);
    expect(await heldBlob(db.env, 'bob', key)).toBeNull();
  });

  it('fits an allowance of exactly its bytes, and one the copier already holds adds nothing', async () => {
    await shared();
    db.env.FILE_MAX_BYTES_PER_OWNER = String(PDF.byteLength);
    expect((await copyAs('bob')).status).toBe(201);
    // A second copy gives nothing new: the allowance is full, and it is made all the same.
    expect((await copyAs('bob')).status).toBe(201);
  });
});

describe('a copy of one’s own document', () => {
  it('names the same stored file, and no row is given', async () => {
    await shared();
    db.env.FILE_MAX_BYTES_PER_OWNER = String(PDF.byteLength);
    const res = await copyAs('ada');
    expect(res.status).toBe(201);
    const { document } = await res.json<{ document: { id: string } }>();
    expect((await read(document.id, 'ada')).status).toBe(200);
    expect(await blobUsage(db.env, 'ada')).toEqual({ bytes: PDF.byteLength, blobs: 1 });
    expect(console.info).not.toHaveBeenCalledWith(expect.stringContaining('[blob-store] given'));
  });
});

describe('a document that passes to another owner', () => {
  it('takes its stored file to a team’s heir', async () => {
    const object = await shared();
    await createTeam(
      db.env,
      { id: 'team', name: 'Team', organisation: null },
      { userId: 'ada', email: 'ada@example.test' },
    );
    db.sql
      .exec(`INSERT INTO team_members (id, team_id, user_id, email, role, status, created_at, updated_at)
      VALUES ('m2', 'team', 'bob', 'bob@example.test', 'member', 'joined', 2, 2)`);
    db.sql.exec("UPDATE documents SET team_id = 'team' WHERE id = 'D'");
    await handTeamWorkToHeir(db.env, 'team', 'ada');
    expect(db.sql.prepare("SELECT owner_id FROM documents WHERE id = 'D'").get()?.owner_id).toBe(
      'bob',
    );
    expect(await heldBlob(db.env, 'bob', key)).toEqual({ size: PDF.byteLength, object });
    // A team document's owner is proven by their account, never by a guest's header.
    const file = await documents('GET', `/api/documents/D/files/${key}`, {
      owner: 'bob',
      account: 'bob',
    });
    expect(file.status).toBe(200);
    expect(console.info).toHaveBeenCalledWith(
      '[blob-store] given count=1 reason=owner document=team:team',
    );
  });

  it('takes its stored file when it is moved into someone’s own library', async () => {
    const object = await shared();
    expect(await setDocumentFolder(db.env, 'D', null, null, 'bob')).toBe(true);
    expect(await heldBlob(db.env, 'bob', key)).toEqual({ size: PDF.byteLength, object });
    expect((await read('D', 'bob')).status).toBe(200);
    expect(console.info).toHaveBeenCalledWith('[blob-store] given count=1 reason=owner document=D');
  });
});

describe('the Trash', () => {
  it('keeps what a trashed document holds, counted, and a restore finds every byte', async () => {
    await shared();
    await trashDocument(db.env, 'D', NOW);
    expect((await sweepBlobs(db.env, NOW)).blobs).toBe(0);
    expect(await blobUsage(db.env, 'ada')).toEqual({ bytes: PDF.byteLength, blobs: 1 });
    expect(await restoreDocument(db.env, 'D', NOW)).toBe(true);
    const file = await read('D', 'ada');
    expect(file.status).toBe(200);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PDF);
  });

  it('lets go when the document is purged: the sweep deletes the bytes after their grace', async () => {
    await shared();
    await trashDocument(db.env, 'D', NOW);
    await purgeDocuments(db.env, ['D']);
    // Stored a moment ago, the bytes would wait for their grace; these are past it.
    expect((await sweepBlobs(db.env, NOW)).blobs).toBe(1);
    expect(bucket.objects.size).toBe(0);
    expect(await blobUsage(db.env, 'ada')).toEqual({ bytes: 0, blobs: 0 });
  });
});

describe('an upload whose claim became a given row', () => {
  it('leaves no object behind, and the row names the given one', async () => {
    const object = await shared();
    // Bob's upload of the same bytes has claimed the key and is storing them when a copy gives him the row.
    const put = bucket.put.bind(bucket);
    bucket.put = (async (...args: Parameters<typeof put>) => {
      const out = await put(...args);
      await db.env.DB.batch(blobGiveCopyStatements(db.env, 'D', 'bob', [key], NOW));
      return out;
    }) as typeof bucket.put;
    const res = await handleBlobStoreRoutes(
      makeTestRouteContext('PUT', `/api/files/${key}`, {
        env: db.env,
        owner: 'bob',
        rawBody: PDF as unknown as string,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(PDF.byteLength),
        },
      }),
    );
    expect(await res.json()).toEqual({ held: true });
    expect([...bucket.objects.keys()]).toEqual([object]);
    expect((await heldBlob(db.env, 'bob', key))?.object).toBe(object);
    expect(console.info).toHaveBeenCalledWith(
      `[blob-store] upload-superseded document=- key=${key.slice(0, 8)}`,
    );
  });

  it('keeps the object when the same upload, sent twice, ended first', async () => {
    // The second of two identical uploads marks nothing: the row is held, and it names this very object.
    const put = bucket.put.bind(bucket);
    bucket.put = (async (...args: Parameters<typeof put>) => {
      const out = await put(...args);
      await markBlobStored(db.env, 'bob', key, PDF.byteLength, NOW);
      return out;
    }) as typeof bucket.put;
    const res = await handleBlobStoreRoutes(
      makeTestRouteContext('PUT', `/api/files/${key}`, {
        env: db.env,
        owner: 'bob',
        rawBody: PDF as unknown as string,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(PDF.byteLength),
        },
      }),
    );
    expect(await res.json()).toEqual({ held: true });
    expect(bucket.blob('bob', key)).toEqual(PDF);
  });
});
