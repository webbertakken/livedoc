// docs/specs/034-text-documents/objects.md "Where the bytes live": a file's pictures land in the opener's gallery and
// the state names them; a download reads them back under the placement rules and leaves out, and counts, one it
// cannot read; the gallery images a text document places are its references (docs/specs/009-elements/images.md
// "Reference index"), pushed to D1 when its outbox drains. Without image storage the state keeps the bytes.
import {
  Pictures,
  readTextDocumentFile,
  TextDocument,
  TextDocumentState,
  writeTextDocumentFile,
  base64OfBytes,
  type Picture,
} from '@livedoc/text-documents';
import { TEXT_DOCUMENT_PICTURES_LEFT_OUT_HEADER } from '@livedoc/api-schema';
import { describe, expect, it } from 'vitest';
import { testR2, type TestR2 } from '../bug-reports/test-r2';
import { readLiveTabState } from '../live-tabs/live-tab-store';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { handleDocuments } from './documents';
import { makeTestRouteContext } from './test-route-context';

/** A PNG's signature and header, `width` by `height`: enough for the package and the gallery to know it. */
const png = (width: number, height: number) =>
  new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    13,
    0x49,
    0x48,
    0x44,
    0x52,
    0,
    0,
    0,
    width,
    0,
    0,
    0,
    height,
    8,
    2,
    0,
    0,
    0,
    0x5a,
    0x5a,
    0x5a,
  ]);

const RED = png(8, 4);
const BLUE = png(6, 6);

async function wordFileWith(...pictures: Uint8Array[]): Promise<Uint8Array> {
  const blank = TextDocument.blank({ format: 'ooxml' });
  const keys = await Promise.all(
    pictures.map(async (b) =>
      [...new Uint8Array(await crypto.subtle.digest('SHA-256', b.slice().buffer))]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join(''),
    ),
  );
  const inline = (media: string): Picture => ({
    type: 'picture',
    media,
    width: 30,
    height: 20,
    props: {},
  });
  const document: TextDocument = {
    ...blank,
    body: [{ type: 'paragraph', style: blank.styles[0]!.id, props: {}, inlines: keys.map(inline) }],
    media: Object.fromEntries(
      keys.map((key, i) => [key, { mediaType: 'image/png' as const, bytes: pictures[i]! }]),
    ),
  };
  const written = writeTextDocumentFile(document, 'docx');
  return written.bytes;
}

const textTab = { id: 't1', name: 'Report', kind: 'text-document', format: 'ooxml', elements: [] };

function call(db: SqliteD1, method: string, path: string, body?: unknown) {
  return handleDocuments(
    makeTestRouteContext(method, path, { env: db.env, owner: 'owner', ...(body ? { body } : {}) }),
  );
}

async function open(db: SqliteD1, file: Uint8Array) {
  const res = await call(db, 'POST', '/api/documents', {
    id: 'D',
    name: 'Pictures',
    tabs: [textTab],
    textDocuments: [{ tabId: 't1', file: base64OfBytes(file) }],
  });
  expect(res.status).toBe(201);
}

const stateOf = async (db: SqliteD1) =>
  TextDocumentState.load([await readLiveTabState(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1')]);

async function download(db: SqliteD1) {
  const res = await call(db, 'GET', '/api/documents/D/text-documents/t1/file?type=docx');
  expect(res.status).toBe(200);
  const read = await readTextDocumentFile(new Uint8Array(await res.arrayBuffer()));
  if (!read.ok) throw new Error(read.rejection);
  return {
    document: read.document,
    leftOut: res.headers.get(TEXT_DOCUMENT_PICTURES_LEFT_OUT_HEADER),
  };
}

const heldBytes = (document: TextDocument) =>
  Pictures.heldMedia(document).map(([, m]) => (Pictures.holdsBytes(m) ? [...m.bytes] : null));

describe('a text document opened from a file with pictures', () => {
  it("stores each picture in the opener's gallery, the state naming the image", async () => {
    const images: TestR2 = testR2();
    const db = sqliteD1({ IMAGES: images });
    await open(db, await wordFileWith(RED, BLUE, RED));
    const rows = db.sql
      .prepare('SELECT id, owner_id, width, height FROM images ORDER BY width')
      .all() as { id: string; owner_id: string; width: number; height: number }[];
    expect(rows.map((r) => [r.owner_id, r.width, r.height])).toEqual([
      ['owner', 6, 6],
      ['owner', 8, 4],
    ]);
    expect([...images.objects.keys()].sort()).toEqual(rows.map((r) => r.id).sort());
    const doc = await stateOf(db);
    const media = TextDocumentState.document(doc, 'ooxml').media ?? {};
    expect(Object.values(media).every((m) => typeof m.image === 'string' && !m.bytes)).toBe(true);
    expect(TextDocumentState.galleryImages(doc).sort()).toEqual(rows.map((r) => r.id).sort());
  });

  it('downloads the pictures whole, read back from the gallery', async () => {
    const db = sqliteD1({ IMAGES: testR2() });
    await open(db, await wordFileWith(RED, BLUE));
    const { document, leftOut } = await download(db);
    expect(heldBytes(document)).toEqual([[...RED], [...BLUE]]);
    expect(leftOut).toBe('0');
  });

  it('names its gallery images in the reference index, pushed to D1 when the outbox drains', async () => {
    const db = sqliteD1({ IMAGES: testR2() });
    await open(db, await wordFileWith(RED, BLUE));
    await db.flush();
    const ids = (db.sql.prepare('SELECT id FROM images ORDER BY id').all() as { id: string }[]).map(
      (r) => r.id,
    );
    const refs = db.sql
      .prepare("SELECT image_id FROM image_refs WHERE tab_id = 't1' ORDER BY image_id")
      .all() as { image_id: string }[];
    expect(refs.map((r) => r.image_id)).toEqual(ids);
    const placed = db.sql
      .prepare("SELECT image_id FROM document_images WHERE document_id = 'D' ORDER BY image_id")
      .all() as { image_id: string }[];
    expect(placed.map((r) => r.image_id)).toEqual(ids);
  });

  it('leaves out, and counts, a picture whose bytes it cannot read', async () => {
    const images = testR2();
    const db = sqliteD1({ IMAGES: images });
    await open(db, await wordFileWith(RED, BLUE));
    const red = (db.sql.prepare('SELECT id FROM images WHERE width = 8').get() as { id: string })
      .id;
    images.objects.delete(red);
    const { document, leftOut } = await download(db);
    expect(heldBytes(document)).toEqual([[...BLUE]]);
    expect(Pictures.ofDocument(document)).toHaveLength(1);
    expect(leftOut).toBe('1');
  });

  it('keeps the bytes in the state where the deployment stores no images', async () => {
    const db = sqliteD1();
    await open(db, await wordFileWith(RED));
    const doc = await stateOf(db);
    expect(heldBytes(TextDocumentState.document(doc, 'ooxml'))).toEqual([[...RED]]);
    expect(TextDocumentState.galleryImages(doc)).toEqual([]);
    const { document, leftOut } = await download(db);
    expect(heldBytes(document)).toEqual([[...RED]]);
    expect(leftOut).toBe('0');
  });
});
