// docs/specs/035-pdf-documents/live-editing-and-storage.md "Copies, the Trash and versions": a copy of one's own
// document carries each PDF tab's live changes with the create, and the create refuses a seed by name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobKeyOf, type BlobKey, type Tab } from '@livedoc/document';
import { PDF_LIVE_CHANGES_MAX_BYTES, PdfLiveChanges } from '@livedoc/pdf-documents';
import { base64OfBytes } from '@livedoc/text-documents';
import { testFilesBucket } from '../blob-store/test-files-bucket';
import { claimBlob, markBlobStored } from '../db/blobs';
import { readLiveTabState } from '../live-tabs/live-tab-store';
import { handleDocuments } from '../routes/documents';
import { makeTestRouteContext } from '../routes/test-route-context';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { PDF_LIVE_TAB } from './pdf-live-tab';
import { readPdfSeeds } from './seed-pdf-documents';

const PDF = Uint8Array.from(new TextEncoder().encode('%PDF-1.7\na file with changes\n%%EOF\n'));
const OTHER = 'b'.repeat(64) as BlobKey;

let db: SqliteD1;
let key: BlobKey;

beforeEach(async () => {
  db = sqliteD1();
  db.env.FILES = testFilesBucket();
  key = await blobKeyOf(PDF);
  await claimBlob(db.env, 'ada', key, PDF.byteLength, 1);
  await markBlobStored(db.env, 'ada', key, PDF.byteLength, 1);
  for (const level of ['warn', 'info', 'log'] as const)
    vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const pdfTab = (id = 't1'): Tab => ({
  id,
  name: 'Contract',
  kind: 'pdf',
  elements: [],
  blob: key,
  size: PDF.byteLength,
});

// Live changes on a stored file of three pages.
function changesOn(blob: BlobKey): Uint8Array {
  const doc = PdfLiveChanges.load();
  PdfLiveChanges.setStored(doc, { blob, pages: 3 });
  return PdfLiveChanges.encode(doc);
}
const seedOf = (tabId: string, state: Uint8Array) => ({ tabId, state: base64OfBytes(state) });

const create = (pdfDocuments: unknown) =>
  handleDocuments(
    makeTestRouteContext('POST', '/api/documents', {
      env: db.env,
      owner: 'ada',
      body: { id: 'D', name: 'Copy', tabs: [pdfTab()], pdfDocuments },
    }),
  );

const documentCount = () => db.sql.prepare('SELECT COUNT(*) AS n FROM documents').get()?.n;

describe('a create that carries a PDF tab’s live changes', () => {
  it('stores them as the tab’s state before anyone opens it', async () => {
    const res = await create([seedOf('t1', changesOn(key))]);
    expect(res.status).toBe(201);
    const stored = PdfLiveChanges.load([await readLiveTabState(db.env, PDF_LIVE_TAB, 't1')]);
    expect(PdfLiveChanges.stored(stored)).toEqual({ blob: key, pages: 3 });
    expect(console.info).toHaveBeenCalledWith(
      expect.stringMatching(/^\[pdf\] copied document=D tab=t1 bytes=\d+$/),
    );
  });

  it('takes changes that name no stored file: they are on the tab’s own', async () => {
    const res = await create([seedOf('t1', PdfLiveChanges.encode(PdfLiveChanges.load()))]);
    expect(res.status).toBe(201);
  });

  it('makes the document as ever when there are none', async () => {
    expect((await create(undefined)).status).toBe(201);
    expect((await readLiveTabState(db.env, PDF_LIVE_TAB, 't1')).byteLength).toBeLessThan(8);
  });
});

describe('a seed the create refuses', () => {
  const refused: [string, () => unknown][] = [
    ['is no list', () => ({ tabId: 't1' })],
    ['names no tab', () => [null]],
    ['names a tab the request does not hold', () => [seedOf('t9', changesOn(key))]],
    ['names a tab twice', () => [seedOf('t1', changesOn(key)), seedOf('t1', changesOn(key))]],
    ['carries no state', () => [{ tabId: 't1' }]],
    ['is no Yjs update', () => [seedOf('t1', Uint8Array.of(1, 2, 3, 4))]],
    ['names another stored file than its tab’s', () => [seedOf('t1', changesOn(OTHER))]],
  ];

  it.each(refused)('%s: 400 pdf_seed_invalid, and nothing is made', async (_name, seeds) => {
    const res = await create(seeds());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'pdf_seed_invalid' });
    expect(documentCount()).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[pdf] seed-refused name=pdf_seed_invalid'),
    );
  });

  it('names a tab of another kind', async () => {
    const board = { id: 't0', name: 'Board', elements: [] } as Tab;
    const res = readPdfSeeds([seedOf('t0', changesOn(key))], [board, pdfTab()]);
    expect((res as Response).status).toBe(400);
    expect(readPdfSeeds([seedOf('t1', changesOn(key))], null)).toBeInstanceOf(Response);
  });

  it('past the limit: 413 live_changes_too_large', async () => {
    const state = changesOn(key);
    const res = readPdfSeeds([seedOf('t1', state)], [pdfTab()], state.byteLength - 1);
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(413);
    expect(await (res as Response).json()).toEqual({
      error: 'live_changes_too_large',
      limitBytes: state.byteLength - 1,
    });
    // At the limit it is taken; the limit itself is the live changes' own.
    expect(readPdfSeeds([seedOf('t1', state)], [pdfTab()], state.byteLength)).toHaveLength(1);
    expect(PDF_LIVE_CHANGES_MAX_BYTES).toBe(4_194_304);
  });
});
