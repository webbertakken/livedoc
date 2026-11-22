// docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Unknown content (D114): kept content as the room stores it,
// read back whole; a row that cannot be read is left out and logged, never read as something else.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeptContent, StoredAt } from '@livedoc/sheets/files';
import type { DocumentEnv } from '../types';
import { workbookKit, type WorkbookKit } from '../routes/workbook-test-kit';
import { keptAddStatements, keptStored, readKept } from './workbook-kept';

let kit: WorkbookKit;
const env = (): DocumentEnv => kit.sql.env;
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const ooxml: KeptContent<StoredAt> = {
  standard: 'ooxml',
  items: [
    {
      place: 'worksheet',
      xml: '<drawing r:id="rId1"/>',
      ns: { r: R },
      at: { sheet: 'book1Sheet' },
    },
  ],
  relationships: [
    {
      id: 'rId1',
      type: `${R}/drawing`,
      target: '/xl/drawings/d.xml',
      from: 'sheet',
      at: { sheet: 'book1Sheet' },
    },
    {
      id: 'rId2',
      type: `${R}/hyperlink`,
      target: 'https://x',
      external: true,
      from: 'package',
      at: {},
    },
    { id: 'rId3', type: `${R}/theme`, target: '/xl/theme/theme1.xml', from: 'workbook', at: {} },
  ],
  parts: [
    {
      name: 'xl/drawings/d.xml',
      type: 'application/vnd.openxmlformats-officedocument.drawing+xml',
      data: new TextEncoder().encode('<d/>'),
      rels: [{ id: 'rId1', type: `${R}/image`, target: '../media/a.png' }],
    },
    // An entry with no bytes has no chunks.
    { name: 'xl/empty.bin', type: '', data: new Uint8Array(), rels: [] },
  ],
};

async function store(kept: KeptContent<StoredAt>): Promise<void> {
  const stored = await keptStored(env(), 'book1');
  if (!stored) throw new Error('no spreadsheet');
  await env().DOCUMENT_DB.batch(keptAddStatements(env(), 'book1', kept, stored.next, 10));
}

beforeEach(async () => {
  kit = workbookKit();
  await kit.call({ path: '', body: kit.document('book1', true) });
});

describe('the kept store', () => {
  it('reads back what it stored, the next seqs after it', async () => {
    expect(await keptStored(env(), 'book1')).toMatchObject({
      standard: null,
      bytes: 0,
      next: { items: 0 },
    });
    await store(ooxml);
    expect(await readKept(env(), 'book1')).toEqual(ooxml);
    expect(await keptStored(env(), 'book1')).toMatchObject({
      standard: 'ooxml',
      bytes: 10,
      partNames: new Set(['xl/drawings/d.xml', 'xl/empty.bin']),
      next: { items: 1, relationships: 3, parts: 2 },
    });
  });

  it('answers nothing for a document that is no spreadsheet', async () => {
    expect(await keptStored(env(), 'nope')).toBeNull();
    expect(await readKept(env(), 'nope')).toBeUndefined();
  });

  it('leaves out and logs a row it cannot read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await store(ooxml);
    kit.sql.sql.exec(
      "INSERT INTO workbook_kept_items (document_id, seq, place, xml, ns) VALUES ('book1', 5, 'nowhere', '<a/>', '{}');" +
        "INSERT INTO workbook_kept_items (document_id, seq, place, xml, ns) VALUES ('book1', 6, 'workbook', '<b/>', 'not json');" +
        "INSERT INTO workbook_kept_items (document_id, seq, place, xml, ns) VALUES ('book1', 7, 'workbook', X'3C', '{}');" +
        'UPDATE workbook_kept_parts SET size = 99;',
    );
    const kept = await readKept(env(), 'book1');
    // A value that is not text reads as none.
    expect(kept?.items.map((item) => item.xml)).toEqual(['<drawing r:id="rId1"/>', '<b/>', '']);
    expect(kept?.items[1]!.ns).toEqual({});
    expect(kept?.parts).toEqual([]);
    expect(warn.mock.calls.map((call): unknown => call[0])).toEqual([
      '[workbook] unreadable kept row',
      '[workbook] unreadable kept row',
      '[workbook] kept entry short',
      '[workbook] kept entry short',
    ]);
    warn.mockRestore();
  });

  it('goes with its sheet when the sheet is deleted for good', async () => {
    await store(ooxml);
    kit.sql.sql.exec("DELETE FROM sheets WHERE id = 'book1Sheet'");
    const kept = await readKept(env(), 'book1');
    expect(kept?.items).toEqual([]);
    expect(kept?.relationships.map((rel) => rel.id)).toEqual(['rId2', 'rId3']);
  });
});
