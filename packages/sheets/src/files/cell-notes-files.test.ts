// docs/specs/029-sheets/standard-mapping.md "Notes in the file" (D648, D649): a cell's note written as each suite
// writes one (ODF an annotation in the cell, XLSX a notes part with the VML drawing Excel shows it by) and read back
// as the cell's note, beside its value and format; a cell holding only a note too.
import { describe, expect, it } from 'vitest';
import { ByteBudget, listZip, readZipEntry } from '@livedoc/office-packages';
import { writeTestZip } from '@livedoc/office-packages/testing';
import { cellKey, emptyLayout, emptySheet, type Cell, type Sheet } from '../sheet';
import { SHEET_NOTE_MAX } from '../note';
import { WorkbookRecord } from '../workbook-record';
import { readOds } from './ods-read';
import { readXlsx } from './xlsx-read';
import { writeWorkbook } from './write-workbook';
import { sheetsFromFile } from './workbook-file';

let n = 13;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

function sheetOf(id: string, title: string, cells: Record<string, Cell>): Sheet {
  const layout = emptyLayout(rand, 8, 6);
  const sheet = emptySheet({ id, tabId: `t-${id}`, title, layout });
  for (const [a1, cell] of Object.entries(cells))
    sheet.cells.set(
      cellKey(layout.rows[Number(a1.slice(1)) - 1]!, layout.cols[a1.charCodeAt(0) - 65]!),
      cell,
    );
  return sheet;
}

const book = () => [
  sheetOf('sheetOne1', 'Sheet1', {
    A1: { input: { s: 'Total' }, format: { b: true }, note: 'Check the total' },
    B2: { note: 'Only a note\non two lines' },
    C3: { input: { n: 7 }, note: 'Tags <b> & "quotes"' },
    D4: { input: { s: 'Plain' } },
  }),
  sheetOf('sheetTwo2', 'Second', { A1: { input: { s: 'x' }, note: 'On the second sheet' } }),
];

async function entriesOf(data: Uint8Array<ArrayBuffer>): Promise<Map<string, string>> {
  const listed = listZip(data);
  if (!listed.ok) throw new Error(listed.refusal);
  const out = new Map<string, string>();
  for (const entry of listed.entries) {
    const read = await readZipEntry(data, entry, new ByteBudget(50_000_000));
    if (read.ok) out.set(entry.name, new TextDecoder().decode(read.bytes));
  }
  return out;
}

async function readBack(data: Uint8Array<ArrayBuffer>, format: 'xlsx' | 'ods') {
  const got = format === 'xlsx' ? await readXlsx(data) : await readOds(data);
  if (!got.ok) throw new Error(got.rejection);
  return sheetsFromFile(got.file, 'en-GB', rand);
}

// Each made sheet's cells by A1: its note, and its value when it has one.
function notesOf(made: ReturnType<typeof sheetsFromFile>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of made.sheets)
    for (const cell of s.cells) {
      if (cell.n === undefined) continue;
      const r = s.layout.rows.indexOf(cell.r);
      const c = s.layout.cols.indexOf(cell.c);
      out[`${s.title}!${String.fromCharCode(65 + c)}${r + 1}`] = cell.i ? [cell.n, cell.i] : cell.n;
    }
  return out;
}

const ROUND_TRIP = {
  'Sheet1!A1': ['Check the total', { s: 'Total' }],
  'Sheet1!B2': 'Only a note\non two lines',
  'Sheet1!C3': ['Tags <b> & "quotes"', { n: 7 }],
  'Second!A1': ['On the second sheet', { s: 'x' }],
};

describe.each(['xlsx', 'ods'] as const)('cells’ notes in .%s', (format) => {
  it('round-trip beside each cell’s value and format', async () => {
    const made = await readBack(writeWorkbook(book(), record, 'Notes', format).data, format);
    expect(notesOf(made)).toEqual(ROUND_TRIP);
    const a1 = made.sheets[0]!.cells.find((c) => c.n === 'Check the total');
    expect(a1?.f).toMatchObject({ b: true });
  });
});

describe('the forms written', () => {
  it('ODF: a hidden annotation first in the cell, a paragraph a line', async () => {
    const content = (await entriesOf(writeWorkbook(book(), record, 'Notes', 'ods').data)).get(
      'content.xml',
    )!;
    expect(content).toContain(
      '<office:annotation office:display="false"><text:p>Only a note</text:p><text:p>on two lines</text:p></office:annotation>',
    );
    expect(content).toMatch(
      /<table:table-cell[^>]*><office:annotation office:display="false"><text:p>Check the total<\/text:p><\/office:annotation><text:p>Total<\/text:p>/,
    );
    expect(content).toContain('<text:p>Tags &lt;b&gt; &amp; "quotes"</text:p>');
  });

  it('XLSX: a notes part and its VML drawing per sheet, named by the sheet’s relationships', async () => {
    const entries = await entriesOf(writeWorkbook(book(), record, 'Notes', 'xlsx').data);
    const notes = entries.get('xl/comments1.xml')!;
    expect(notes).toContain('<authors><author>LiveDoc</author></authors>');
    expect(notes).toContain(
      '<comment ref="B2" authorId="0"><text><r><t xml:space="preserve">Only a note\non two lines</t></r></text></comment>',
    );
    expect(notes).toContain('Tags &lt;b&gt; &amp; "quotes"');
    expect(entries.get('xl/comments2.xml')).toContain('<comment ref="A1" authorId="0">');
    const vml = entries.get('xl/drawings/vmlDrawing1.vml')!;
    expect(vml.match(/<x:ClientData ObjectType="Note">/g)).toHaveLength(3);
    expect(vml).toContain('<x:Row>1</x:Row><x:Column>1</x:Column>');
    const sheet = entries.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('<legacyDrawing r:id="rIdNotesVml"/>');
    const rels = entries.get('xl/worksheets/_rels/sheet1.xml.rels')!;
    expect(rels).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"',
    );
    expect(rels).toContain('Target="../drawings/vmlDrawing1.vml"');
    const types = entries.get('[Content_Types].xml')!;
    expect(types).toContain(
      '<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>',
    );
    expect(types).toContain(
      '<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>',
    );
  });

  it('writes no notes part for a workbook without notes', async () => {
    const plain = [sheetOf('sheetOne1', 'Sheet1', { A1: { input: { s: 'x' } } })];
    const entries = await entriesOf(writeWorkbook(plain, record, 'Plain', 'xlsx').data);
    expect([...entries.keys()].some((k) => /comments|vmlDrawing/.test(k))).toBe(false);
    expect(entries.get('[Content_Types].xml')).not.toContain('vml');
  });
});

describe('notes a file holds', () => {
  it('XLSX: runs joined, an author’s note read as written, carriage returns as line breaks', async () => {
    const entries = await entriesOf(writeWorkbook(book(), record, 'Notes', 'xlsx').data);
    entries.set(
      'xl/comments1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>Ada</author></authors><commentList>' +
        '<comment ref="A1" authorId="0"><text><r><rPr><b/></rPr><t>Ada:</t></r><r><t xml:space="preserve">\r\nSee me</t></r></text></comment>' +
        '<comment ref="E5" authorId="0"><text><t>Plain t</t></text></comment>' +
        '<comment ref="nope" authorId="0"><text><t>x</t></text></comment>' +
        `<comment ref="F6" authorId="0"><text><t>${'y'.repeat(SHEET_NOTE_MAX + 5)}</t></text></comment>` +
        '</commentList></comments>',
    );
    const data = writeTestZip(
      [...entries].map(([name, t]) => ({ name, data: new TextEncoder().encode(t) })),
    );
    const made = await readBack(data, 'xlsx');
    const got = notesOf(made);
    expect(got['Sheet1!A1']).toEqual(['Ada:\nSee me', { s: 'Total' }]);
    expect(got['Sheet1!E5']).toBe('Plain t');
    expect((got['Sheet1!F6'] as string).length).toBe(SHEET_NOTE_MAX);
    expect(got['Sheet1!B2']).toBeUndefined();
  });

  it('ODF: an annotation’s paragraphs joined by line breaks, never the cell’s text, and not kept', async () => {
    const entries = await entriesOf(writeWorkbook(book(), record, 'Notes', 'ods').data);
    const content = entries
      .get('content.xml')!
      .replace(
        '<office:annotation office:display="false"><text:p>Check the total</text:p></office:annotation>',
        '<office:annotation><dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">Ann</dc:creator><text:p>First</text:p><text:p>Second <text:span>line</text:span></text:p></office:annotation>',
      );
    entries.set('content.xml', content);
    const data = writeTestZip(
      [...entries].map(([name, t]) => ({ name, data: new TextEncoder().encode(t) })),
    );
    const got = await readOds(data);
    if (!got.ok) throw new Error(got.rejection);
    const made = sheetsFromFile(got.file, 'en-GB', rand);
    expect(notesOf(made)['Sheet1!A1']).toEqual(['First\nSecond line', { s: 'Total' }]);
    expect((made.kept?.items ?? []).some((item) => item.xml.includes('annotation'))).toBe(false);
  });
});
