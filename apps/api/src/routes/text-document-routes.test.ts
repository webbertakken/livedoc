import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  Body,
  readTextDocumentFile,
  TextDocument,
  TextDocumentState,
  TEXT_DOCUMENT_CHUNK_BYTES,
  TEXT_DOCUMENT_UPDATE_MAX_BYTES,
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
import { RoomTextDocuments } from '../text-documents/room-text-documents';

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

  // live-editing-and-storage.md "The layout": the whole model lives in the room, so a file's formatting, lists,
  // styles and kept content leave as they arrived; its title is the document's name.
  it("keeps the file's formatting and kept content through the room, both formats", async () => {
    for (const [name, format] of [
      ['features.odt', 'odf'],
      ['features.docx', 'ooxml'],
    ] as const) {
      const db = sqliteD1();
      const bytes = new Uint8Array(
        readFileSync(
          join(import.meta.dirname, '../../../../packages/text-documents/corpus/libreoffice', name),
        ),
      );
      const arrived = await readTextDocumentFile(bytes);
      if (!arrived.ok) throw new Error('fixture');
      const file = base64OfBytes(bytes);
      const tab = { ...textTab, format };
      expect((await create(db, { textDocuments: [{ tabId: 't1', file }] }, [tab])).status).toBe(
        201,
      );
      const type = format === 'odf' ? 'odt' : 'docx';
      const download = await call(
        db,
        'GET',
        `/api/documents/D/text-documents/t1/file?type=${type}`,
      );
      const left = await readTextDocumentFile(new Uint8Array(await download.arrayBuffer()));
      if (!left.ok) throw new Error('download');
      expect(left.document.body).toEqual(arrived.document.body);
      expect(left.document.styles).toEqual(arrived.document.styles);
      expect(left.document.lists).toEqual(arrived.document.lists);
      expect(left.document.metadata.title).toBe('Q3 report');
    }
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

  // live-editing-and-storage.md "Copies": a Duplicate seeds the copy with each state, a big one folded into chunks.
  it('holds a state a copy seeds it with, and refuses one that is no update', async () => {
    const db = sqliteD1();
    const big = Array.from({ length: TEXT_DOCUMENT_CHUNK_BYTES / 5 }, (_, i) =>
      (i * 7919).toString(36).padStart(6, '0'),
    ).join('');
    const state = base64OfBytes(TextDocumentState.fromBody(Body.of('Copied', big)));
    expect((await create(db, { textDocuments: [{ tabId: 't1', state }] })).status).toBe(201);
    const res = await call(db, 'GET', '/api/documents/D/text-documents/t1/state');
    expect(await bodyOfState(res)).toEqual(Body.of('Copied', big));
    const refused = await create(sqliteD1(), {
      textDocuments: [{ tabId: 't1', state: base64OfBytes(Uint8Array.of(9, 9, 9)) }],
    });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ error: 'text_document_seed_invalid' });
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

// live-editing-and-storage.md "Sending": an update too large for a frame goes by the door, an edit of the tab, stored
// by the room on its write queue.
describe('the update door', () => {
  // A room whose internal door runs the real room side over the test's database.
  function withRoom(db: SqliteD1) {
    const relayed: unknown[] = [];
    const room = new RoomTextDocuments({
      env: db.env,
      enqueue: (step) => step(),
      sequence: (_from, op) => relayed.push(op),
      sendTo: () => {},
      position: () => ({ epoch: 'e' }),
    });
    const binding = {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (input: string, init?: RequestInit) => {
          const url = new URL(input);
          if (url.pathname !== '/text-document-update') return new Response(null, { status: 404 });
          const outcome = await room.acceptPosted(
            url.searchParams.get('document')!,
            url.searchParams.get('tab')!,
            new Uint8Array(init!.body as ArrayBuffer),
          );
          return new Response(null, { status: outcome === 'stored' ? 204 : 404 });
        },
      }),
    };
    (db.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = binding;
    return relayed;
  }

  const post = (db: SqliteD1, tabId: string, bytes: Uint8Array, owner = 'owner') =>
    handleDocuments(
      makeTestRouteContext('POST', `/api/documents/D/text-documents/${tabId}/updates`, {
        env: db.env,
        owner,
        rawBody: bytes as unknown as string,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    );

  it('stores an Editor’s update and relays it', async () => {
    const db = sqliteD1();
    await create(db);
    const relayed = withRoom(db);
    const res = await post(db, 't1', TextDocumentState.fromBody(Body.of('Pasted')));
    expect(res.status).toBe(204);
    const state = await call(db, 'GET', '/api/documents/D/text-documents/t1/state');
    expect(await bodyOfState(state)).toEqual(Body.of('Pasted'));
    expect(relayed).toHaveLength(1);
  });

  it('names an update that is none, and one past the cap', async () => {
    const db = sqliteD1();
    await create(db);
    withRoom(db);
    const invalid = await post(db, 't1', Uint8Array.of(9, 9, 9));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'update_invalid' });
    const huge = await post(db, 't1', new Uint8Array(TEXT_DOCUMENT_UPDATE_MAX_BYTES + 1));
    expect(huge.status).toBe(413);
    expect(await huge.json()).toEqual({ error: 'update_too_large' });
  });

  it('answers 404 for a tab that is no text document, and 403 for a caller who may not edit', async () => {
    const db = sqliteD1();
    await create(db, {}, [textTab, { id: 'c', name: 'Canvas', elements: [] }]);
    withRoom(db);
    const update = TextDocumentState.fromBody(Body.of('x'));
    const canvas = await post(db, 'c', update);
    expect(canvas.status).toBe(404);
    expect(await canvas.json()).toEqual({ error: 'text_document_not_found' });
    expect((await post(db, 't1', update, 'stranger')).status).toBe(403);
  });
});

// live-editing-and-storage.md "Reconnecting": a catch-up reads only what it lacks, and the state's vector.
describe('the state since a reader’s vector', () => {
  it('answers only what the reader lacks, with the state’s vector', async () => {
    const db = sqliteD1();
    await create(db);
    const first = await call(db, 'GET', '/api/documents/D/text-documents/t1/state');
    const known = new Uint8Array(await first.arrayBuffer());
    await appendTextDocumentUpdate(db.env, 't1', TextDocumentState.fromBody(Body.of('Later')));
    const vector = base64OfBytes(TextDocumentState.stateVectorOf(known));
    const res = await call(
      db,
      'GET',
      `/api/documents/D/text-documents/t1/state?since=${encodeURIComponent(vector)}`,
    );
    expect(res.status).toBe(200);
    const missing = new Uint8Array(await res.arrayBuffer());
    const reader = TextDocumentState.load([known, missing]);
    expect(TextDocumentState.paragraphs(reader)).toEqual(Body.of('Later'));
    const full = TextDocumentState.merge(await storedUpdates(db.env, 't1'));
    expect(res.headers.get('X-State-Vector')).toBe(
      base64OfBytes(TextDocumentState.stateVectorOf(full)),
    );
  });

  it('names a vector that is none', async () => {
    const db = sqliteD1();
    await create(db);
    const res = await call(db, 'GET', '/api/documents/D/text-documents/t1/state?since=***');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'state_vector_invalid' });
  });
});
