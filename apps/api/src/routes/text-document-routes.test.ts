import { describe, expect, it } from 'vitest';
import {
  Body,
  readTextDocumentFile,
  TextDocument,
  TextDocumentState,
  writeTextDocumentFile,
  type TextDocumentFileType,
} from '@livedoc/text-documents';

import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { base64OfBytes } from '@livedoc/text-documents';
import {
  appendTextDocumentUpdate,
  compactTextDocument,
  chunksOf,
  storedUpdates,
} from '../text-documents/text-document-store';
import { makeTestRouteContext } from './test-route-context';

/** A file of these paragraphs, in the format its type is. */
function fileOf(body: Body, type: TextDocumentFileType = 'odt'): Uint8Array {
  const format = type === 'docx' ? 'ooxml' : 'odf';
  const written = writeTextDocumentFile(
    TextDocument.fromTexts(
      body.map((p) => p.text),
      { format },
    ),
    type,
  );
  if (!written.ok) throw new Error('fixture');
  return written.bytes;
}

/** The paragraphs a downloaded file holds. */
async function bodyOfFile(res: Response): Promise<Body | undefined> {
  const read = await readTextDocumentFile(new Uint8Array(await res.arrayBuffer()));
  return read.ok ? Body.of(...TextDocument.paragraphTexts(read.document)) : undefined;
}
import { handleDocuments } from './documents';
import { fileNameOf } from './text-document-routes';

// docs/specs/034-text-documents/files-and-print.md "Opening" and "Downloading";
// docs/specs/034-text-documents/live-editing-and-storage.md "Storage".

const textTab = { id: 't1', name: 'Report', kind: 'text-document', format: 'odf', elements: [] };

function call(db: SqliteD1, method: string, path: string, body?: unknown) {
  return handleDocuments(
    makeTestRouteContext(method, path, { env: db.env, owner: 'owner', ...(body ? { body } : {}) }),
  );
}

async function create(
  db: SqliteD1,
  extra: Record<string, unknown> = {},
  tabs: unknown[] = [textTab],
) {
  return call(db, 'POST', '/api/documents', { id: 'D', name: 'Q3 report', tabs, ...extra });
}

const bodyOfState = async (res: Response) =>
  TextDocumentState.paragraphs(TextDocumentState.load([new Uint8Array(await res.arrayBuffer())]));

describe('a text document opened from a file', () => {
  it('holds the file body, and downloads it again as the same file', async () => {
    const db = sqliteD1();
    const body = Body.of('First paragraph', '  spaced  out ', 'tab\there');
    const file = base64OfBytes(fileOf(body));
    expect((await create(db, { textDocuments: [{ tabId: 't1', file }] })).status).toBe(201);

    const state = await call(db, 'GET', '/api/documents/D/text-documents/t1/state');
    expect(state.status).toBe(200);
    expect(state.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(await bodyOfState(state)).toEqual(body);

    const download = await call(db, 'GET', '/api/documents/D/text-documents/t1/file?type=odt');
    expect(download.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Q3 report.odt"',
    );
    expect(await bodyOfFile(download)).toEqual(body);
    const flat = await call(db, 'GET', '/api/documents/D/text-documents/t1/file?type=fodt');
    expect(await bodyOfFile(flat)).toEqual(body);
  });

  it('starts a text document made without a file from the seed', async () => {
    const db = sqliteD1();
    await create(db);
    const state = await call(db, 'GET', '/api/documents/D/text-documents/t1/state');
    expect(await bodyOfState(state)).toEqual(Body.of(''));
  });

  it('holds a Word file in an OOXML tab, and leaves it as one (C1)', async () => {
    const db = sqliteD1();
    const tab = { ...textTab, format: 'ooxml' };
    const file = base64OfBytes(fileOf(Body.of('Word', 'file'), 'docx'));
    expect((await create(db, { textDocuments: [{ tabId: 't1', file }] }, [tab])).status).toBe(201);
    const download = await call(db, 'GET', '/api/documents/D/text-documents/t1/file?type=docx');
    expect(download.status).toBe(200);
    expect(await bodyOfFile(download)).toEqual(Body.of('Word', 'file'));
    expect((await call(db, 'GET', '/api/documents/D/text-documents/t1/file?type=odt')).status).toBe(
      409,
    );
  });

  it('refuses a Word file for a tab held in ODF, never changing its format', async () => {
    const db = sqliteD1();
    const file = base64OfBytes(fileOf(Body.of('Word'), 'docx'));
    const res = await create(db, { textDocuments: [{ tabId: 't1', file }] });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'package_wrong_type' });
  });

  it('reads a flat file too', async () => {
    const db = sqliteD1();
    const file = base64OfBytes(fileOf(Body.of('Flat'), 'fodt'));
    await create(db, { textDocuments: [{ tabId: 't1', file }] });
    const state = await call(db, 'GET', '/api/documents/D/text-documents/t1/state');
    expect(await bodyOfState(state)).toEqual(Body.of('Flat'));
  });

  it('refuses a file that is not one, by the package rejection, and makes nothing', async () => {
    const db = sqliteD1();
    const doctype = base64OfBytes(new TextEncoder().encode('<!DOCTYPE x><x/>'));
    const res = await create(db, { textDocuments: [{ tabId: 't1', file: doctype }] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'xml_doctype_refused' });
    expect((await call(db, 'GET', '/api/documents/D/text-documents/t1/state')).status).toBe(404);
  });

  it('answers a spreadsheet with 415', async () => {
    const db = sqliteD1();
    const sheet = `<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:mimetype="application/vnd.oasis.opendocument.spreadsheet"/>`;
    const res = await create(db, {
      textDocuments: [{ tabId: 't1', file: base64OfBytes(new TextEncoder().encode(sheet)) }],
    });
    expect(res.status).toBe(415);
  });

  it('refuses seeds that do not name one of the request’s text document tabs', async () => {
    const file = base64OfBytes(fileOf(Body.of('a')));
    for (const textDocuments of [
      'nope',
      [{ tabId: 'other', file }],
      [
        { tabId: 't1', file },
        { tabId: 't1', file },
      ],
      [{ tabId: 't1', file: 7 }],
      [{ tabId: 't1', file: '***' }],
      [null],
    ]) {
      const res = await create(sqliteD1(), { textDocuments });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'text_document_seed_invalid' });
    }
  });
});

describe('the text document doors', () => {
  it('are a text document tab’s alone', async () => {
    const db = sqliteD1();
    await create(db, {}, [textTab, { id: 'c', name: 'Canvas', elements: [] }]);
    expect((await call(db, 'GET', '/api/documents/D/text-documents/c/state')).status).toBe(404);
    expect((await call(db, 'GET', '/api/documents/D/text-documents/zz/file')).status).toBe(404);
    expect((await call(db, 'GET', '/api/documents/X/text-documents/t1/state')).status).toBe(404);
  });

  it('leave a document in its own format only, and name an unknown file', async () => {
    const db = sqliteD1();
    await create(db);
    const unknown = await call(db, 'GET', '/api/documents/D/text-documents/t1/file?type=pdf');
    expect(await unknown.json()).toEqual({ error: 'file_type_unknown' });
    const docx = await call(db, 'GET', '/api/documents/D/text-documents/t1/file?type=docx');
    expect(docx.status).toBe(409);
    expect((await call(db, 'GET', '/api/documents/D/text-documents/t1/file')).status).toBe(200);
  });

  it('refuse a caller without access', async () => {
    const db = sqliteD1();
    await create(db);
    const res = await handleDocuments(
      makeTestRouteContext('GET', '/api/documents/D/text-documents/t1/state', {
        env: db.env,
        owner: 'stranger',
      }),
    );
    expect(res.status).toBe(403);
  });

  it('names a download after the document, safely', () => {
    expect(fileNameOf('a/b: "c"', 'odt')).toBe('a b c.odt');
    expect(fileNameOf('   ', 'fodt')).toBe('Untitled.fodt');
  });
});

describe('the stored state', () => {
  it('folds the log into chunks under the row cap, keeping the state', async () => {
    const db = sqliteD1();
    await create(db);
    await appendTextDocumentUpdate(db.env, 't1', TextDocumentState.fromBody(Body.of('one')));
    const before = TextDocumentState.merge(await storedUpdates(db.env, 't1'));
    expect(await compactTextDocument(db.env, 't1')).toBe(1);
    const after = await storedUpdates(db.env, 't1');
    expect(after).toHaveLength(1);
    expect(TextDocumentState.paragraphs(TextDocumentState.load(after))).toEqual(
      TextDocumentState.paragraphs(TextDocumentState.load([before])),
    );
    expect(chunksOf(new Uint8Array(5), 2).map((c) => c.byteLength)).toEqual([2, 2, 1]);
  });
});
