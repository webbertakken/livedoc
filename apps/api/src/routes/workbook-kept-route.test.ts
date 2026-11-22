// docs/specs/029-sheets/sheet-store.md "In a spreadsheet" (Unknown content), "Copies and exports"; standard-mapping.md
// "Unknown content" (D109, D113); files-and-print.md "Converting": a file's kept content stored by an Editor's
// requests, each refusal named, read whole, written into files of its standard, left out of the other's and written
// again once converted back, and carried by a copy.
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  WorkbookConversionResponse,
  WorkbookKeptResponse,
  WorkbookKeptStoredResponse,
} from '@livedoc/api-schema';
import { keptFromWire, keptToWire } from '@livedoc/api-schema/workbook-kept';
import {
  KEPT_MAX_BYTES,
  KEPT_PART_MAX_BYTES,
  readWorkbookFile,
  type KeptContent,
  type StoredAt,
} from '@livedoc/sheets/files';
import { ODF_NS } from '@livedoc/office-packages';
import { KEPT_CHUNK_BYTES } from '../db/workbook-kept';
import { workbookKit, type KitCall, type WorkbookKit } from './workbook-test-kit';

let kit: WorkbookKit;
const SHEET = 'book1Sheet';
const SHAPES =
  '<table:shapes><draw:frame draw:name="pic"><draw:image xlink:href="Pictures/cat.png" xlink:type="simple"/></draw:frame></table:shapes>';
const NAMES =
  '<table:named-expressions><table:named-range table:name="Total" table:base-cell-address="$Sheet1.$A$1" table:cell-range-address="$Sheet1.$A$1"/></table:named-expressions>';

function odfKept(more: Partial<KeptContent<StoredAt>> = {}): KeptContent<StoredAt> {
  return {
    standard: 'odf',
    items: [
      {
        place: 'table-before',
        xml: SHAPES,
        ns: { table: ODF_NS.table, draw: ODF_NS.draw, xlink: ODF_NS.xlink },
        at: { sheet: SHEET },
      },
      { place: 'spreadsheet-after', xml: NAMES, ns: { table: ODF_NS.table }, at: {} },
      {
        place: 'cell-attribute',
        xml: 'table:number-columns-spanned="2"',
        ns: { table: ODF_NS.table },
        at: { sheet: SHEET, r: kit.layout.rows[0], c: kit.layout.cols[0] },
      },
    ],
    relationships: [],
    parts: [
      { name: 'Pictures/cat.png', type: 'image/png', data: new Uint8Array([1, 2, 3]), rels: [] },
    ],
    ...more,
  };
}

const post = (body: unknown, extra: Partial<KitCall> = {}) =>
  kit.call({ path: '/book1/workbook/kept', body, ...extra });
const read = (extra: Partial<KitCall> = {}) =>
  kit.call({ method: 'GET', path: '/book1/workbook/kept', ...extra });
// A share link's holder, on its tab when the link is scoped to one.
const holder = (code: string): Partial<KitCall> => ({ owner: 'guest', code });
const SCOPED = { path: '/book1/workbook/kept?tabId=book1t', owner: 'guest', code: 'TAB1' };
const errorOf = async (res: Response) => [res.status, (await res.json<{ error: string }>()).error];

async function fileKept(format: 'ods' | 'xlsx', id = 'book1') {
  const res = await kit.call({ method: 'GET', path: `/${id}/workbook/file?format=${format}` });
  expect(res.status).toBe(200);
  const opened = await readWorkbookFile(new Uint8Array(await res.arrayBuffer()), 'en-GB');
  if (!opened.ok) throw new Error(opened.rejection);
  return opened.file.kept;
}

beforeEach(async () => {
  kit = workbookKit();
  expect((await kit.call({ path: '', body: kit.document('book1', true) })).status).toBe(201);
  kit.sql.sql.exec(
    "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('EDIT', 'book1', 'edit', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('VIEW', 'book1', 'view', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, level, tab_id, created_at) VALUES ('TAKE', 'book1', 'view', 'participate', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB1', 'book1', 'edit', 'book1t', 1);",
  );
});

describe('keeping a file’s content', () => {
  it('stores it by an Editor’s requests, in order, and reads it whole', async () => {
    const kept = odfKept();
    const first = await post(keptToWire({ ...kept, parts: [] }));
    expect(first.status).toBe(200);
    const second = await post(keptToWire({ ...kept, items: [kept.items[0]!] }), holder('EDIT'));
    expect(await second.json<WorkbookKeptStoredResponse>()).toMatchObject({
      standard: 'odf',
      items: 4,
      parts: 1,
    });
    const answer = await (await read(holder('VIEW'))).json<WorkbookKeptResponse>();
    expect(keptFromWire(answer.kept)).toEqual({ ...kept, items: [...kept.items, kept.items[0]] });
  });

  it('answers null for a spreadsheet that keeps nothing', async () => {
    expect(await (await read()).json<WorkbookKeptResponse>()).toEqual({ kept: null });
  });

  it('stores an entry in chunks under the row cap and reads it back whole', async () => {
    const data = Uint8Array.from({ length: KEPT_CHUNK_BYTES * 2 + 5 }, (_, i) => i % 251);
    const kept = odfKept({
      parts: [{ name: 'Pictures/big.png', type: 'image/png', data, rels: [] }],
    });
    expect((await post(keptToWire(kept))).status).toBe(200);
    const chunks = kit.sql.sql.prepare('SELECT COUNT(*) AS n FROM workbook_kept_chunks').get() as {
      n: number;
    };
    expect(chunks.n).toBe(3);
    const answer = await (await read()).json<WorkbookKeptResponse>();
    expect(keptFromWire(answer.kept)?.parts[0]!.data).toEqual(data);
  });

  // gate-a-feature-by-share-role: only an Editor keeps content; a tab-scoped link reaches neither door.
  it.each([
    ['a Viewer', holder('VIEW')],
    ['a Participant', holder('TAKE')],
    ['a tab-scoped Editor', SCOPED],
  ])('refuses %s', async (_who, as) => {
    expect((await post(keptToWire(odfKept()), as)).status).toBe(403);
    expect(kit.sql.sql.prepare('SELECT COUNT(*) AS n FROM workbook_kept_items').get()).toEqual({
      n: 0,
    });
  });

  it('reads for anyone who may read, never on a tab-scoped link', async () => {
    expect((await read(holder('TAKE'))).status).toBe(200);
    expect((await read(SCOPED)).status).toBe(403);
  });

  it('refuses each fault by name and stores nothing of it', async () => {
    const kept = odfKept();
    const wire = keptToWire(kept);
    expect(await errorOf(await post([]))).toEqual([400, 'kept_invalid']);
    expect(await errorOf(await post({ ...wire, items: 'x' }))).toEqual([400, 'kept_invalid']);
    expect(
      await errorOf(await post({ ...wire, items: [{ ...wire.items[0], xml: '<a/><b/>' }] })),
    ).toEqual([400, 'kept_item_invalid']);
    expect(
      await errorOf(await post({ ...wire, parts: [{ ...wire.parts[0], name: 'content.xml' }] })),
    ).toEqual([400, 'kept_part_invalid']);
    const rel = { id: 'rId1', type: 't', target: '/x', from: 'workbook', at: {} };
    expect(await errorOf(await post({ ...wire, relationships: [rel] }))).toEqual([
      400,
      'kept_relationship_invalid',
    ]);
    expect(
      await errorOf(await post({ ...wire, items: [{ ...wire.items[0], at: { sheet: 'gone' } }] })),
    ).toEqual([400, 'kept_anchor_invalid']);
    const huge = new Uint8Array(KEPT_PART_MAX_BYTES + 1);
    expect(
      await errorOf(
        await post(keptToWire({ ...kept, parts: [{ ...kept.parts[0]!, data: huge }] })),
      ),
    ).toEqual([413, 'kept_too_large']);
    expect(kit.sql.sql.prepare('SELECT COUNT(*) AS n FROM workbook_kept_items').get()).toEqual({
      n: 0,
    });
  });

  it('refuses an entry stored already, the other standard, and content past the sizes', async () => {
    const wire = keptToWire(odfKept());
    expect((await post(wire)).status).toBe(200);
    expect(await errorOf(await post(wire))).toEqual([400, 'kept_part_invalid']);
    const ooxml = { standard: 'ooxml', items: [], relationships: [], parts: [] };
    expect(await errorOf(await post(ooxml))).toEqual([409, 'kept_standard_mismatch']);
    kit.sql.sql.exec(`UPDATE workbook SET kept_bytes = ${KEPT_MAX_BYTES - 10}`);
    expect(await errorOf(await post({ ...wire, parts: [] }))).toEqual([413, 'kept_too_large']);
    const huge = {
      ...wire.items[0],
      xml: `<table:shapes>${' '.repeat(1024 * 1024)}</table:shapes>`,
    };
    expect(await errorOf(await post({ ...wire, parts: [], items: [huge] }))).toEqual([
      413,
      'kept_too_large',
    ]);
  });

  it('refuses a body past the api’s and a document that is no spreadsheet', async () => {
    const big = {
      standard: 'odf',
      items: [],
      relationships: [],
      parts: [],
      pad: 'x'.repeat(9 * 1024 * 1024),
    };
    expect(await errorOf(await post(big))).toEqual([413, 'kept_too_large']);
    await kit.call({ path: '', body: kit.document('plan1', false) });
    const res = await kit.call({ path: '/plan1/workbook/kept', body: keptToWire(odfKept()) });
    expect(await errorOf(res)).toEqual([404, 'workbook_not_found']);
    const got = await kit.call({ method: 'GET', path: '/plan1/workbook/kept' });
    expect(await errorOf(got)).toEqual([404, 'workbook_not_found']);
    expect((await kit.call({ method: 'GET', path: '/gone1/workbook/kept' })).status).toBe(404);
  });
});

describe('kept content in the files', () => {
  it('is written into a file of its standard, left out of the other’s, and written again once converted back', async () => {
    expect((await post(keptToWire(odfKept()))).status).toBe(200);
    const own = await fileKept('ods');
    expect(own?.items.map((item) => item.xml)).toEqual(
      expect.arrayContaining([SHAPES, NAMES, 'table:number-columns-spanned="2"']),
    );
    expect(own?.parts.map((part) => part.name)).toContain('Pictures/cat.png');
    const listed = await (
      await kit.call({ method: 'GET', path: '/book1/workbook/conversion?to=xlsx' })
    ).json<WorkbookConversionResponse>();
    expect(listed.losses).toContainEqual({
      k: 'kept',
      count: 3,
      kinds: ['drawings', 'named-ranges', 'merges'],
    });
    // Converted: an Excel file leaves the OpenDocument content out (D109).
    expect(
      (await kit.call({ path: '/book1/workbook/conversion', body: { format: 'xlsx' } })).status,
    ).toBe(200);
    expect(JSON.stringify((await fileKept('xlsx')) ?? null)).not.toContain('table:shapes');
    // Undo converts back: the kept content is written again.
    expect(
      (await kit.call({ path: '/book1/workbook/conversion', body: { format: 'ods' } })).status,
    ).toBe(200);
    expect((await fileKept('ods'))?.items.map((item) => item.xml)).toEqual(
      own?.items.map((item) => item.xml),
    );
  });

  // sheet-store.md "Copies and exports": a copy of a spreadsheet keeps its kept content.
  it('is carried by a copy', async () => {
    expect((await post(keptToWire(odfKept()))).status).toBe(200);
    const res = await kit.call({ path: '/book1/copy', body: {} });
    const { document } = await res.json<{ document: { id: string } }>();
    const copied = await kit.call({ method: 'GET', path: `/${document.id}/workbook/kept` });
    const original = await (await read()).json<WorkbookKeptResponse>();
    expect(await copied.json<WorkbookKeptResponse>()).toEqual(original);
  });
});
