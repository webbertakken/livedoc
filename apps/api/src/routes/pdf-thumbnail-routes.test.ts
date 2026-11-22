// docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's thumbnail": its two doors, who is wanted,
// each refusal by name, and what every delivery path of a snapshot then shows
// (docs/specs/006-document/document-snapshots.md).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobKeyOf, type BlobKey } from '@livedoc/document';
import { PDF_THUMBNAIL_MAX_BYTES } from '@livedoc/pdf-documents';
import { testFilesBucket } from '../blob-store/test-files-bucket';
import { browserThumbnailKey, shareCardKey, thumbnailKey } from '../db/documents';
import { createShareLink } from '../db/share';
import { pdfThumbnailSvg } from '../pdf-documents/pdf-browser-thumbnail';
import { TEST_JPEG_CAMERA, testJpeg } from '../pdf-documents/test-jpeg';
import { testImagesBucket, type TestImagesBucket } from '../test-images-bucket';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { handleBlobStoreRoutes } from './blob-store-routes';
import { handleDocuments } from './documents';
import { makeTestRouteContext } from './test-route-context';

const PDF = Uint8Array.from(new TextEncoder().encode('%PDF-1.7\na small file\n%%EOF\n'));
const JPEG = testJpeg(480, 679);
const DOOR = '/api/documents/D/pdf-documents/t1/thumbnail';

let db: SqliteD1;
let images: TestImagesBucket;
let key: BlobKey;

function call(
  method: string,
  path: string,
  opts: { owner?: string | null; bytes?: Uint8Array; code?: string; length?: number } = {},
) {
  const { owner = 'ada', bytes, code, length } = opts;
  return handleDocuments(
    makeTestRouteContext(method, path, {
      env: db.env,
      owner,
      ...(bytes ? { rawBody: bytes as unknown as string } : {}),
      headers: {
        'Content-Type': 'image/jpeg',
        ...(length === undefined ? {} : { 'Content-Length': String(length) }),
        ...(code ? { 'X-Share-Code': code } : {}),
      },
    }),
  );
}

const wanted = async (path = DOOR, opts: Parameters<typeof call>[2] = {}) => {
  const res = await call('GET', path, opts);
  return res.status === 200 ? (await res.json<{ wanted: boolean }>()).wanted : res.status;
};
const errorOf = async (res: Response) =>
  `${res.status} ${(await res.json<{ error: string }>()).error}`;
const savedLater = () =>
  db.env.DB.prepare('UPDATE documents SET saved_at = saved_at + 1000 WHERE id = ?').bind('D').run();

async function makeDocument(id: string, tabs: unknown[]) {
  const made = await handleDocuments(
    makeTestRouteContext('POST', '/api/documents', {
      env: db.env,
      owner: 'ada',
      body: { id, name: 'Contract', tabs },
    }),
  );
  expect(made.status).toBe(201);
}

beforeEach(async () => {
  db = sqliteD1();
  db.env.FILES = testFilesBucket();
  images = testImagesBucket();
  db.env.IMAGES = images;
  key = await blobKeyOf(PDF);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  await handleBlobStoreRoutes(
    makeTestRouteContext('PUT', `/api/files/${key}`, {
      env: db.env,
      owner: 'ada',
      rawBody: PDF as unknown as string,
      headers: { 'Content-Length': String(PDF.byteLength) },
    }),
  );
  const pdf = { name: 'Contract', kind: 'pdf', elements: [], blob: key, size: PDF.byteLength };
  await makeDocument('D', [
    { ...pdf, id: 't1' },
    { ...pdf, id: 't2', name: 'Annex' },
  ]);
});
afterEach(() => vi.restoreAllMocks());

describe('whether a picture is wanted of a PDF tab', () => {
  // "no picture is stored for it or the one stored was sent before the document was last saved"
  it('is, until one is sent; and again once the document is saved after it', async () => {
    expect(await wanted()).toBe(true);
    expect((await call('PUT', DOOR, { bytes: JPEG })).status).toBe(204);
    expect(await wanted()).toBe(false);
    await savedLater();
    expect(await wanted()).toBe(true);
  });

  it('is answered to be asked again, never kept', async () => {
    expect((await call('GET', DOOR)).headers.get('Cache-Control')).toBe('no-store');
  });

  // "the tab is the document's first"
  it('is not, of a tab that is not its document’s first', async () => {
    expect(await wanted('/api/documents/D/pdf-documents/t2/thumbnail')).toBe(false);
  });

  // "the server keeps snapshots"
  it('is not, where the server keeps no snapshots', async () => {
    delete (db.env as { IMAGES?: unknown }).IMAGES;
    expect(await wanted()).toBe(false);
  });

  it('is, when the picture stored is of a tab that was the first before', async () => {
    await images.put(browserThumbnailKey('D'), JPEG, {
      customMetadata: { tab: 't2', savedAt: String(Number.MAX_SAFE_INTEGER) },
    });
    expect(await wanted()).toBe(true);
  });

  it('answers no such PDF for a tab that is none, and nothing for a document that is not there', async () => {
    await makeDocument('C', [{ id: 'c1', name: 'Canvas', elements: [] }]);
    expect(await errorOf(await call('GET', '/api/documents/C/pdf-documents/c1/thumbnail'))).toBe(
      '404 pdf_not_found',
    );
    expect(await wanted('/api/documents/NONE/pdf-documents/t1/thumbnail')).toBe(404);
  });
});

// docs/instructions/gate-a-feature-by-share-role.md; "Who sends one: an Editor's open surface"
describe('share roles', () => {
  beforeEach(async () => {
    await createShareLink(db.env, 'D', 'EDITCODE', 'edit');
    await createShareLink(db.env, 'D', 'PARTCODE', 'participate');
    await createShareLink(db.env, 'D', 'VIEWCODE', 'view');
    await createShareLink(db.env, 'D', 'SCOPED01', 'edit', 'never', 't1');
    await createShareLink(db.env, 'D', 'SCOPED02', 'edit', 'never', 't2');
  });

  it.each(['EDITCODE', 'SCOPED01'])(
    'wants one of an Editor on %s, who may send it',
    async (code) => {
      const visitor = { owner: 'bo', code };
      expect(await wanted(DOOR, visitor)).toBe(true);
      expect((await call('PUT', DOOR, { ...visitor, bytes: JPEG })).status).toBe(204);
      expect(await wanted(DOOR, visitor)).toBe(false);
    },
  );

  it.each(['PARTCODE', 'VIEWCODE'])(
    'never wants one of a visitor on %s, and refuses theirs by name',
    async (code) => {
      const visitor = { owner: 'bo', code };
      expect(await wanted(DOOR, visitor)).toBe(false);
      expect(await errorOf(await call('PUT', DOOR, { ...visitor, bytes: JPEG }))).toBe(
        '403 level_too_low',
      );
      expect(images.objects.has(browserThumbnailKey('D'))).toBe(false);
    },
  );

  it('shows a visitor confined to another tab no such tab', async () => {
    const visitor = { owner: 'bo', code: 'SCOPED02' };
    expect(await wanted(DOOR, visitor)).not.toBe(true);
    expect(await errorOf(await call('PUT', DOOR, { ...visitor, bytes: JPEG }))).toBe(
      '404 pdf_not_found',
    );
  });

  it('refuses someone with no way in, and says nothing more', async () => {
    expect((await call('GET', DOOR, { owner: 'mallory' })).status).toBeGreaterThanOrEqual(400);
    expect((await call('PUT', DOOR, { owner: 'mallory', bytes: JPEG })).status).toBe(403);
    expect((await call('PUT', DOOR, { owner: null, bytes: JPEG })).status).toBe(400);
    expect((await call('GET', DOOR, { owner: null })).status).toBe(400);
    expect(images.objects.size).toBe(0);
  });
});

describe('a picture sent of a PDF’s first page', () => {
  it('is stored marked as a browser’s, with the save it was sent at, without its metadata', async () => {
    await call('PUT', DOOR, { bytes: JPEG });
    const stored = images.objects.get(browserThumbnailKey('D'))!;
    expect(stored.customMetadata).toMatchObject({ source: 'browser', tab: 't1' });
    expect(Number(stored.customMetadata.savedAt)).toBeGreaterThan(0);
    expect(new TextDecoder('latin1').decode(stored.bytes)).not.toContain(TEST_JPEG_CAMERA);
  });

  // "An upload removes those, so the next read draws from the new picture"
  it('removes the snapshots drawn from the one before it', async () => {
    for (const drawn of [thumbnailKey('D'), thumbnailKey('D', 'dark'), shareCardKey('D')])
      await images.put(drawn, 'an earlier drawing');
    await db.env.DB.prepare('UPDATE documents SET thumb_rendered_at = saved_at WHERE id = ?')
      .bind('D')
      .run();
    await call('PUT', DOOR, { bytes: JPEG });
    expect([...images.objects.keys()]).toEqual([browserThumbnailKey('D')]);
    const row = await db.env.DB.prepare(
      'SELECT thumb_rendered_at AS at FROM documents WHERE id = ?',
    )
      .bind('D')
      .first<{ at: number }>();
    expect(row?.at).toBe(0);
  });

  // "Shown by every delivery path of Document snapshots: a white page holding the picture."
  it('is what the document’s thumbnail shows, in either half', async () => {
    await call('PUT', DOOR, { bytes: JPEG });
    const stored = images.objects.get(browserThumbnailKey('D'))!.bytes;
    const svg = pdfThumbnailSvg(stored, 480, 679);
    const plain = await call('GET', '/api/documents/D/thumbnail');
    expect(plain.status).toBe(200);
    expect(await plain.text()).toBe(svg);
    expect(await (await call('GET', '/api/documents/D/thumbnail?appearance=dark')).text()).toBe(
      svg,
    );
  });

  // "Until a first one is sent the PDF has none"; document-snapshots.md: that answer is never kept by the browser.
  it('leaves a PDF with none until it is sent, an answer the browser never keeps', async () => {
    const none = await call('GET', '/api/documents/D/thumbnail');
    expect(none.status).toBe(404);
    expect(none.headers.get('Cache-Control')).toBe('no-store');
    // Any other document with nothing drawn keeps its answer for the day, as before.
    await makeDocument('C', [{ id: 'c1', name: 'Canvas', elements: [] }]);
    const empty = await call('GET', '/api/documents/C/thumbnail');
    expect(empty.status).toBe(404);
    expect(empty.headers.get('Cache-Control')).toBe('private, max-age=86400');
  });

  it.each([
    [
      'what is no JPEG',
      new TextEncoder().encode('<svg onload="alert(1)"/>'),
      '400 thumbnail_invalid',
    ],
    ['a side past the longest', testJpeg(20_000, 100), '400 thumbnail_invalid'],
    [
      'more bytes than the limit',
      testJpeg(480, 679, PDF_THUMBNAIL_MAX_BYTES),
      '413 thumbnail_too_large',
    ],
  ])('refuses %s by name, storing nothing', async (_what, bytes, refusal) => {
    expect(await errorOf(await call('PUT', DOOR, { bytes }))).toBe(refusal);
    expect(images.objects.size).toBe(0);
  });

  it('refuses one that says it is too large before reading it', async () => {
    const res = await call('PUT', DOOR, { bytes: JPEG, length: PDF_THUMBNAIL_MAX_BYTES + 1 });
    expect(await errorOf(res)).toBe('413 thumbnail_too_large');
  });

  it('refuses one of a tab that is not the document’s first, and of a tab that is no PDF', async () => {
    const second = await call('PUT', '/api/documents/D/pdf-documents/t2/thumbnail', {
      bytes: JPEG,
    });
    expect(await errorOf(second)).toBe('409 thumbnail_not_wanted');
    await makeDocument('C', [{ id: 'c1', name: 'Canvas', elements: [] }]);
    const canvas = await call('PUT', '/api/documents/C/pdf-documents/c1/thumbnail', {
      bytes: JPEG,
    });
    expect(await errorOf(canvas)).toBe('404 pdf_not_found');
    expect(
      (await call('PUT', '/api/documents/NONE/pdf-documents/t1/thumbnail', { bytes: JPEG })).status,
    ).toBe(404);
    expect(images.objects.size).toBe(0);
  });

  it('refuses one where the server keeps no snapshots', async () => {
    delete (db.env as { IMAGES?: unknown }).IMAGES;
    expect((await call('PUT', DOOR, { bytes: JPEG })).status).toBe(503);
  });

  it('answers no other method', async () => {
    expect((await call('DELETE', DOOR)).status).toBe(404);
  });
});
