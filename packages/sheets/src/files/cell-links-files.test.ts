// docs/specs/029-sheets/standard-mapping.md "Links in the file" (D642): a cell's link written as each suite writes one
// (XLSX hyperlinks, ODF a paragraph wholly one text:a), within the workbook by the sheet's name, and read back as the
// cell's link; one to a sheet that is gone written as none; a file's link of another scheme kept as it came.
import { describe, expect, it } from 'vitest';
import { ByteBudget, listZip, readZipEntry } from '@livedoc/office-packages';
import { writeTestZip } from '@livedoc/office-packages/testing';
import {
  cellKey,
  emptyLayout,
  emptySheet,
  type CellFormat,
  type CellInput,
  type Sheet,
} from '../sheet';
import { WorkbookRecord } from '../workbook-record';
import { readOds } from './ods-read';
import { readXlsx } from './xlsx-read';
import { writeWorkbook } from './write-workbook';
import { sheetsFromFile } from './workbook-file';

let n = 11;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

function sheetOf(
  id: string,
  title: string,
  cells: Record<string, { i?: CellInput; f?: CellFormat }>,
): Sheet {
  const layout = emptyLayout(rand, 8, 6);
  const sheet = emptySheet({ id, tabId: `t-${id}`, title, layout });
  for (const [a1, cell] of Object.entries(cells)) {
    const key = cellKey(layout.rows[Number(a1.slice(1)) - 1]!, layout.cols[a1.charCodeAt(0) - 65]!);
    sheet.cells.set(key, {
      ...(cell.i ? { input: cell.i } : {}),
      ...(cell.f ? { format: cell.f } : {}),
    });
  }
  return sheet;
}

const book = () => [
  sheetOf('sheetOne1', 'Sheet1', {
    A1: { i: { s: 'Web' }, f: { ln: 'https://docs.nu/', b: true } },
    A2: { i: { s: 'Mail' }, f: { ln: 'mailto:ada@example.com' } },
    A3: { i: { s: 'To range' }, f: { ln: '#gid=sheetTwo2&range=B2:C3' } },
    A4: { i: { s: 'To sheet' }, f: { ln: '#gid=sheetTwo2' } },
    A5: { i: { n: 42 }, f: { ln: 'https://example.com/a?b=1&c=2' } },
    A6: { i: { s: 'Gone' }, f: { ln: '#gid=nosuchsheet' } },
    A7: { i: { s: 'Two\nlines' }, f: { ln: 'https://docs.nu/two' } },
    B1: { i: { s: 'Plain' } },
  }),
  sheetOf('sheetTwo2', "Ada's sheet", { A1: { i: { s: 'Here' } } }),
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
  return got;
}

// The links each made sheet holds, by A1, a sheet of the workbook by its title.
function linksOf(made: ReturnType<typeof sheetsFromFile>): Record<string, string> {
  const out: Record<string, string> = {};
  const titleOf = new Map(made.sheets.map((s) => [s.id, s.title]));
  for (const s of made.sheets)
    for (const cell of s.cells) {
      const ln = cell.f?.ln;
      if (!ln) continue;
      const r = s.layout.rows.indexOf(cell.r);
      const c = s.layout.cols.indexOf(cell.c);
      const a1 = `${s.title}!${String.fromCharCode(65 + c)}${r + 1}`;
      out[a1] = ln.replace(/^#gid=([\w-]+)/, (_, id: string) => `#${titleOf.get(id)}`);
    }
  return out;
}

const ROUND_TRIP = {
  'Sheet1!A1': 'https://docs.nu/',
  'Sheet1!A2': 'mailto:ada@example.com',
  'Sheet1!A3': "#Ada's sheet&range=B2:C3",
  'Sheet1!A4': "#Ada's sheet&range=A1",
  'Sheet1!A5': 'https://example.com/a?b=1&c=2',
  'Sheet1!A7': 'https://docs.nu/two',
};

describe.each(['xlsx', 'ods'] as const)('cells’ links in .%s', (format) => {
  it('round-trip, each cell keeping its value and its other formats', async () => {
    const out = writeWorkbook(book(), record, 'Links', format);
    const read = await readBack(out.data, format);
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(linksOf(made)).toEqual(ROUND_TRIP);
    const a5 = made.sheets[0]!.cells.find((c) => c.f?.ln === 'https://example.com/a?b=1&c=2');
    const a1 = made.sheets[0]!.cells.find((c) => c.f?.ln === 'https://docs.nu/');
    expect(a1).toMatchObject({ i: { s: 'Web' }, f: { b: true } });
    // ODF reads a number's cell as LibreOffice writes one; its link stays either way.
    expect(a5?.i).toEqual({ n: 42 });
    // A link to a sheet that is gone is written as none: its text plain.
    const gone = made.sheets[0]!.cells.find((c) => c.i && 's' in c.i && c.i.s === 'Gone');
    expect(gone?.f?.ln).toBeUndefined();
  });
});

describe('the forms written', () => {
  it('XLSX: hyperlinks after the validations, addresses as external relationships, ranges as locations', async () => {
    const entries = await entriesOf(writeWorkbook(book(), record, 'Links', 'xlsx').data);
    const sheet = entries.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toMatch(/<hyperlinks><hyperlink ref="A1" r:id="rIdLink1"\/>/);
    expect(sheet).toContain(`<hyperlink ref="A3" location="'Ada''s sheet'!B2:C3"/>`);
    expect(sheet).toContain(`<hyperlink ref="A4" location="'Ada''s sheet'!A1"/>`);
    expect(sheet).not.toContain('ref="A6"');
    const rels = entries.get('xl/worksheets/_rels/sheet1.xml.rels')!;
    expect(rels).toContain('Target="https://docs.nu/" TargetMode="External"');
    expect(rels).toContain('Target="https://example.com/a?b=1&amp;c=2"');
  });

  it('ODF: each of the cell’s paragraphs wholly its link', async () => {
    const entries = await entriesOf(writeWorkbook(book(), record, 'Links', 'ods').data);
    const content = entries.get('content.xml')!;
    expect(content).toContain(
      '<text:p><text:a xlink:type="simple" xlink:href="https://docs.nu/">Web</text:a></text:p>',
    );
    expect(content).toContain(`xlink:href="#'Ada''s sheet'.B2:C3">To range</text:a>`);
    expect(content).toContain(
      '<text:p><text:a xlink:type="simple" xlink:href="https://docs.nu/two">Two</text:a></text:p><text:p><text:a xlink:type="simple" xlink:href="https://docs.nu/two">lines</text:a></text:p>',
    );
    expect(content).toMatch(/xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/);
  });
});

describe('links a file holds', () => {
  it('XLSX: a block’s cells, an empty cell’s, a location of a sheet the file lacks, another scheme kept', async () => {
    const written = writeWorkbook(book(), record, 'Links', 'xlsx').data;
    const entries = await entriesOf(written);
    const sheet = entries
      .get('xl/worksheets/sheet1.xml')!
      .replace(/<hyperlinks>[\s\S]*<\/hyperlinks>/, () =>
        [
          '<hyperlinks>',
          '<hyperlink ref="A1:B1" r:id="rIdX"/>',
          '<hyperlink ref="F8" location="Sheet1!A1"/>',
          '<hyperlink ref="A2" location="NoSuchSheet!A1"/>',
          '<hyperlink ref="A3" r:id="rIdY"/>',
          '<hyperlink ref="A4" location="Sheet1!A1" r:id="rIdZ"/>',
          '<hyperlink ref="nope"/>',
          '<hyperlink ref="A7"/>',
          '</hyperlinks>',
        ].join(''),
      );
    const rels = entries
      .get('xl/worksheets/_rels/sheet1.xml.rels')!
      .replace(
        '</Relationships>',
        '<Relationship Id="rIdX" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://a.example/" TargetMode="External"/>' +
          '<Relationship Id="rIdY" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="file:///c/notes.txt" TargetMode="External"/>' +
          '<Relationship Id="rIdZ" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://b.example/" TargetMode="External"/></Relationships>',
      );
    entries.set('xl/worksheets/sheet1.xml', sheet);
    entries.set('xl/worksheets/_rels/sheet1.xml.rels', rels);
    const data = writeTestZip(
      [...entries].map(([name, t]) => ({ name, data: new TextEncoder().encode(t) })),
    );
    const read = await readBack(data, 'xlsx');
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(linksOf(made)).toEqual({
      'Sheet1!A1': 'https://a.example/',
      'Sheet1!B1': 'https://a.example/',
      'Sheet1!F8': '#Sheet1&range=A1',
      'Sheet1!A2': '#NoSuchSheet!A1',
      'Sheet1!A3': 'file:///c/notes.txt',
      'Sheet1!A4': 'https://b.example/#Sheet1!A1',
    });
    // Read whole, the hyperlinks are kept no more.
    const again = await entriesOf(
      writeWorkbook(
        made.sheets.map((s, i) => ({
          ...emptySheet({ id: s.id, tabId: `t${i}`, title: s.title, layout: s.layout }),
          cells: cellsOf(s),
        })),
        record,
        'Links',
        'xlsx',
        made.kept,
      ).data,
    );
    expect(again.get('xl/worksheets/sheet1.xml')!.match(/<hyperlinks>/g)).toHaveLength(1);
    expect(again.get('xl/worksheets/sheet1.xml')).toContain(
      '<hyperlink ref="A2" location="NoSuchSheet!A1"/>',
    );
  });

  it('ODF: a cell wholly one link, and a sheet the file lacks kept as written; part of a cell’s text stays kept', async () => {
    const written = writeWorkbook(book(), record, 'Links', 'ods').data;
    const entries = await entriesOf(written);
    const content = entries
      .get('content.xml')!
      .replace('>Web</text:a>', () => '>Web</text:a> and more')
      .replace(`xlink:href="#'Ada''s sheet'.B2:C3"`, () => 'xlink:href="#NoSuchSheet.A1"');
    entries.set('content.xml', content);
    const data = writeTestZip(
      [...entries].map(([name, t]) => ({ name, data: new TextEncoder().encode(t) })),
    );
    const read = await readBack(data, 'ods');
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    const links = linksOf(made);
    expect(links['Sheet1!A1']).toBeUndefined();
    expect(links['Sheet1!A3']).toBe('#NoSuchSheet.A1');
    // The part-linked cell's paragraph is kept whole (D376) and written back while its text reads the same.
    const again = await entriesOf(
      writeWorkbook(
        made.sheets.map((s, i) => ({
          ...emptySheet({ id: s.id, tabId: `t${i}`, title: s.title, layout: s.layout }),
          cells: cellsOf(s),
        })),
        record,
        'Links',
        'ods',
        made.kept,
      ).data,
    );
    expect(again.get('content.xml')).toContain('>Web</text:a> and more');
  });
});

function cellsOf(s: ReturnType<typeof sheetsFromFile>['sheets'][number]): Sheet['cells'] {
  const sheet = emptySheet({ id: s.id, tabId: 't', title: s.title, layout: s.layout });
  for (const cell of s.cells)
    sheet.cells.set(cellKey(cell.r, cell.c), {
      ...(cell.i ? { input: cell.i } : {}),
      ...(cell.f ? { format: cell.f } : {}),
    });
  return sheet.cells;
}
