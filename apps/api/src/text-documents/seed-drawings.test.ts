// docs/specs/034-text-documents/objects.md "In the file": a file read into a LiveDoc document keeps a picture's drawing
// name only while that tab is a drawing tab of the text document it is read into; otherwise the picture is plain.
import {
  base64OfBytes,
  Pictures,
  TextDocument,
  TextDocumentState,
  writeTextDocumentFile,
  type Picture,
} from '@livedoc/text-documents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readLiveTabState } from '../live-tabs/live-tab-store';
import { handleDocuments } from '../routes/documents';
import { makeTestRouteContext } from '../routes/test-route-context';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { TEXT_DOCUMENT_LIVE_TAB } from './text-document-live-tab';

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 4,
  0, 0, 0, 2, 8, 2, 0, 0, 0, 0x5a, 0x5a, 0x5a,
]);

/** A Word file of one paragraph holding a picture per name, each naming that drawing tab. */
async function wordFileNaming(...drawings: string[]): Promise<Uint8Array> {
  const blank = TextDocument.blank({ format: 'ooxml' });
  const key = [...new Uint8Array(await crypto.subtle.digest('SHA-256', PNG.slice().buffer))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  const inline = (drawing: string): Picture => ({
    type: 'picture',
    media: key,
    width: 30,
    height: 15,
    props: {},
    drawing,
  });
  const written = writeTextDocumentFile(
    {
      ...blank,
      body: [
        { type: 'paragraph', style: blank.styles[0]!.id, props: {}, inlines: drawings.map(inline) },
      ],
      media: { [key]: { mediaType: 'image/png', bytes: PNG } },
    },
    'docx',
  );
  if (!written.ok) throw new Error('fixture');
  return written.bytes;
}

const textTab = { id: 't1', name: 'Report', kind: 'text-document', format: 'ooxml', elements: [] };
const drawingTab = (id: string, drawingOf: string) => ({
  id,
  name: 'Drawing 1',
  drawingOf,
  elements: [],
});

let db: SqliteD1;
let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  db = sqliteD1();
  info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

async function open(file: Uint8Array, tabs: object[]) {
  const res = await handleDocuments(
    makeTestRouteContext('POST', '/api/documents', {
      env: db.env,
      owner: 'owner',
      body: {
        id: 'D',
        name: 'Drawings',
        tabs,
        textDocuments: [{ tabId: 't1', file: base64OfBytes(file) }],
      },
    }),
  );
  expect(res.status).toBe(201);
  const doc = TextDocumentState.load([
    await readLiveTabState(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1'),
  ]);
  return Pictures.ofDocument(TextDocumentState.document(doc, 'ooxml')).map((p) => p.drawing);
}

describe('a file read into a text document', () => {
  it('keeps the names of its own drawing tabs, and drops any other', async () => {
    const names = await open(await wordFileNaming('d1', 'elsewhere'), [
      textTab,
      drawingTab('d1', 't1'),
    ]);
    expect(names).toEqual(['d1', undefined]);
    expect(info).toHaveBeenCalledWith(
      '[text-document] drawing names dropped document=D tab=t1 count=1',
    );
  });

  it("drops a name of another tab's drawing tab", async () => {
    const other = { ...textTab, id: 't2' };
    const names = await open(await wordFileNaming('d2'), [textTab, other, drawingTab('d2', 't2')]);
    expect(names).toEqual([undefined]);
  });
});
