// docs/specs/029-sheets/standard-mapping.md "Comments in the file" (D657-D660): a sheet's comment threads written as
// each suite writes its own (XLSX threaded comments with persons and Excel's placeholder, ODF an annotation holding the
// conversation) with LiveDoc's record beside them, and read back whole; another suite's threads read by their names.
import { describe, expect, it } from 'vitest';
import { ByteBudget, listZip, readZipEntry } from '@livedoc/office-packages';
import { writeTestZip } from '@livedoc/office-packages/testing';
import { cellKey, emptyLayout, emptySheet, type Cell, type Sheet } from '../sheet';
import { WorkbookRecord } from '../workbook-record';
import type { IdThread } from './file-threads';
import { readOds } from './ods-read';
import { readXlsx } from './xlsx-read';
import { writeWorkbook } from './write-workbook';
import { sheetsFromFile } from './workbook-file';

let n = 29;
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

const at = (sheet: Sheet, a1: string) => ({
  r: sheet.layout.rows[Number(a1.slice(1)) - 1]!,
  c: sheet.layout.cols[a1.charCodeAt(0) - 65]!,
});
const anchor = (sheet: Sheet, from: string, to = from) => {
  const a = at(sheet, from);
  const b = at(sheet, to);
  return { r1: a.r, c1: a.c, r2: b.r, c2: b.c };
};

const ADA = { author: 'Ada', colour: '#0284c7' };
const BO = { author: 'Bo Lee', colour: '#16a34a' };
const priya = { userId: 'u-p', name: 'Priya', handle: 'priya' };

function book() {
  const one = sheetOf('sheetOne1', 'Sheet1', {
    A1: { input: { s: 'Total' } },
    C3: { input: { n: 7 }, note: 'A note too' },
  });
  const two = sheetOf('sheetTwo2', 'Second', {});
  const threads = new Map<string, IdThread[]>([
    [
      one.id,
      [
        {
          anchor: anchor(one, 'A1', 'B2'),
          resolved: false,
          comments: [
            { ...ADA, text: 'Is this final?\nTwo lines', at: Date.UTC(2026, 0, 2, 10) },
            {
              ...BO,
              text: 'Yes @priya',
              at: Date.UTC(2026, 0, 2, 11),
              edited: Date.UTC(2026, 0, 2, 12),
              mentions: [priya],
              assignee: priya,
              reactions: { '👍': ['k-ada'] },
            },
          ],
        },
        {
          anchor: anchor(one, 'C3'),
          resolved: true,
          comments: [{ ...BO, text: 'Done & <dusted>', at: Date.UTC(2026, 0, 3) }],
        },
        // Its row deleted: not written (D653).
        {
          anchor: { r1: 'gone', c1: 'gone', r2: 'gone', c2: 'gone' },
          resolved: false,
          comments: [{ ...ADA, text: 'x', at: 1 }],
        },
      ],
    ],
    [
      two.id,
      [
        {
          anchor: anchor(two, 'D4'),
          resolved: false,
          comments: [{ ...ADA, text: 'Empty cell', at: 5 }],
        },
      ],
    ],
  ]);
  return { sheets: [one, two], threads };
}

const zipOf = (files: Record<string, string>) =>
  writeTestZip(Object.entries(files).map(([name, data]) => ({ name, data })));

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

// A made sheet's threads by their anchor in A1, and its notes.
function placed(made: Awaited<ReturnType<typeof readBack>>) {
  return made.sheets.map((s) => {
    const a1 = (r: string, c: string) =>
      `${String.fromCharCode(65 + s.layout.cols.indexOf(c))}${s.layout.rows.indexOf(r) + 1}`;
    return {
      title: s.title,
      threads: (s.threads ?? []).map((t) => ({
        at: `${a1(t.anchor.r1, t.anchor.c1)}:${a1(t.anchor.r2, t.anchor.c2)}`,
        resolved: t.resolved,
        comments: t.comments,
      })),
      notes: s.cells.filter((c) => c.n !== undefined).map((c) => [a1(c.r, c.c), c.n]),
    };
  });
}

describe.each(['xlsx', 'ods'] as const)('comment threads in .%s', (format) => {
  it('round-trip whole: ranges, replies, resolved, colours, edits, mentions, assignees, reactions, a note beside', async () => {
    const { sheets, threads } = book();
    const made = await readBack(
      writeWorkbook(sheets, record, 'Threads', format, undefined, undefined, threads).data,
      format,
    );
    const [one, two] = placed(made);
    expect(one!.threads).toEqual([
      { at: 'A1:B2', resolved: false, comments: threads.get('sheetOne1')![0]!.comments },
      { at: 'C3:C3', resolved: true, comments: threads.get('sheetOne1')![1]!.comments },
    ]);
    expect(one!.notes).toEqual([['C3', 'A note too']]);
    expect(two!.threads).toEqual([
      { at: 'D4:D4', resolved: false, comments: [{ ...ADA, text: 'Empty cell', at: 5 }] },
    ]);
  });

  it('writes none for a workbook without threads', async () => {
    const { sheets } = book();
    const made = await readBack(writeWorkbook(sheets, record, 'Plain', format).data, format);
    expect(made.sheets.every((s) => s.threads === undefined)).toBe(true);
  });
});

describe('the forms written', () => {
  it('XLSX: threaded comments with their persons, Excel’s placeholder in the cell’s note’s place (D657, D658)', async () => {
    const { sheets, threads } = book();
    const entries = await entriesOf(
      writeWorkbook(sheets, record, 'Threads', 'xlsx', undefined, undefined, threads).data,
    );
    const part = entries.get('xl/threadedComments/threadedComment1.xml')!;
    expect(part).toContain(
      '<threadedComment ref="A1" dT="2026-01-02T10:00:00.000Z" personId="{4C495645-0000-4000-8000-000000000001}" id="{4C495645-0001-4000-8000-000000000000}"><text>Is this final?\nTwo lines</text><extLst><x:ext uri="urn:livedoc:xmlns:spreadsheet:1.0"',
    );
    expect(part).toContain(
      'id="{4C495645-0001-4000-8001-000000000000}" parentId="{4C495645-0001-4000-8000-000000000000}"><text>Yes @priya</text></threadedComment>',
    );
    expect(part).toContain(
      'id="{4C495645-0001-4001-8000-000000000000}" done="1"><text>Done &amp; &lt;dusted&gt;</text>',
    );
    expect(entries.get('xl/persons/person.xml')).toContain(
      '<person displayName="Bo Lee" id="{4C495645-0000-4000-8000-000000000002}" userId="Bo Lee" providerId="None"/>',
    );
    const notes = entries.get('xl/comments1.xml')!;
    expect(notes).toContain('<author>tc={4C495645-0001-4000-8000-000000000000}</author>');
    expect(notes).toContain('[Threaded comment]');
    expect(notes).toContain('Comment:\n    Done &amp; &lt;dusted&gt;');
    expect(notes).not.toContain('A note too');
    const rels = entries.get('xl/worksheets/_rels/sheet1.xml.rels')!;
    expect(rels).toContain(
      'Type="http://schemas.microsoft.com/office/2017/10/relationships/threadedComment" Target="../threadedComments/threadedComment1.xml"',
    );
    expect(entries.get('xl/_rels/workbook.xml.rels')).toContain(
      'Type="http://schemas.microsoft.com/office/2017/10/relationships/person" Target="persons/person.xml"',
    );
    const types = entries.get('[Content_Types].xml')!;
    expect(types).toContain('ContentType="application/vnd.ms-excel.threadedcomments+xml"');
    expect(types).toContain(
      '<Override PartName="/xl/persons/person.xml" ContentType="application/vnd.ms-excel.person+xml"/>',
    );
  });

  it('ODF: one annotation holding the conversation, LiveDoc’s record beside it (D659)', async () => {
    const { sheets, threads } = book();
    const content = (
      await entriesOf(
        writeWorkbook(sheets, record, 'Threads', 'ods', undefined, undefined, threads).data,
      )
    ).get('content.xml')!;
    expect(content).toMatch(
      /<office:annotation office:display="false" xmlns:dc="http:\/\/purl.org\/dc\/elements\/1.1\/" xmlns:livedoc="urn:livedoc:xmlns:spreadsheet:1.0" livedoc:thread="[^"]+" livedoc:thread-fingerprint="[0-9a-f]{8}"><dc:creator>Ada<\/dc:creator><dc:date>2026-01-02T10:00:00.000<\/dc:date><text:p>Is this final\?<\/text:p><text:p>Two lines<\/text:p><text:p>Bo Lee: Yes @priya<\/text:p><\/office:annotation>/,
    );
    expect(content.match(/<office:annotation /g)).toHaveLength(3);
  });
});

describe('threads another suite wrote', () => {
  const sheetXml =
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="2"><c r="B2" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>';
  const types = (extra: string) =>
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    extra +
    '</Types>';
  const T = 'http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments';

  it('XLSX: Excel’s threads by their persons’ names, replies in time order, done resolved; its placeholder no note', async () => {
    const data = zipOf({
      '[Content_Types].xml': types(
        '<Override PartName="/xl/threadedComments/t1.xml" ContentType="application/vnd.ms-excel.threadedcomments+xml"/><Override PartName="/xl/persons/person.xml" ContentType="application/vnd.ms-excel.person+xml"/><Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>',
      ),
      '_rels/.rels':
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rS"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rP" Type="http://schemas.microsoft.com/office/2017/10/relationships/person" Target="persons/person.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': sheetXml,
      'xl/worksheets/_rels/sheet1.xml.rels':
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rT" Type="http://schemas.microsoft.com/office/2017/10/relationships/threadedComment" Target="../threadedComments/t1.xml"/><Relationship Id="rC" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/></Relationships>',
      'xl/persons/person.xml': `<personList xmlns="${T}"><person displayName="Jose Contoso" id="{P1}" userId="j" providerId="None"/><person displayName="Kim" id="{P2}"/><person id="{P3}"/><other/></personList>`,
      'xl/threadedComments/t1.xml': `<ThreadedComments xmlns="${T}"><threadedComment ref="B2" dT="2025-05-01T10:00:00.00" personId="{P1}" id="{A}" done="1"><text>Root</text><extLst><x:ext xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" uri="{other}"/><x:ext xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" uri="urn:livedoc:xmlns:spreadsheet:1.0"><livedoc:thread xmlns:livedoc="urn:livedoc:xmlns:spreadsheet:1.0" record="{&quot;range&quot;:{&quot;r1&quot;:1,&quot;c1&quot;:1,&quot;r2&quot;:3,&quot;c2&quot;:3},&quot;resolved&quot;:false,&quot;comments&quot;:[{&quot;text&quot;:&quot;Root&quot;,&quot;at&quot;:1,&quot;author&quot;:&quot;Was&quot;}]}"/></x:ext></extLst></threadedComment><threadedComment ref="B2" personId="{P1}"><text>No id</text></threadedComment><foo/><threadedComment ref="B2" dT="2025-05-01T12:00:00.00" personId="{P1}" id="{C}" parentId="{A}"><text>Later</text></threadedComment><threadedComment ref="B2" dT="2025-05-01T11:00:00.00" personId="{P2}" id="{B}" parentId="{A}"><text>Sooner</text></threadedComment><threadedComment ref="nowhere" personId="{P1}" id="{X}"><text>Lost</text></threadedComment></ThreadedComments>`,
      'xl/comments1.xml':
        '<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>tc={A}</author><author>Pat</author></authors><commentList><comment ref="B2" authorId="0"><text><t>[Threaded comment] Root</t></text></comment><comment ref="A1" authorId="1"><text><t>A real note</t></text></comment></commentList></comments>',
    });
    const made = await readBack(data, 'xlsx');
    const [one] = placed(made);
    expect(one!.threads).toEqual([
      {
        at: 'B2:B2',
        resolved: true,
        comments: [
          {
            text: 'Root',
            at: Date.parse('2025-05-01T10:00:00.00'),
            author: 'Jose Contoso',
            colour: '#6b7280',
          },
          {
            text: 'Sooner',
            at: Date.parse('2025-05-01T11:00:00.00'),
            author: 'Kim',
            colour: '#6b7280',
          },
          {
            text: 'Later',
            at: Date.parse('2025-05-01T12:00:00.00'),
            author: 'Jose Contoso',
            colour: '#6b7280',
          },
        ],
      },
    ]);
    expect(one!.notes).toEqual([['A1', 'A real note']]);
  });

  it('ODF: an annotation whose text another suite changed is the cell’s note (D660)', async () => {
    const { sheets, threads } = book();
    const entries = await entriesOf(
      writeWorkbook(sheets, record, 'Threads', 'ods', undefined, undefined, threads).data,
    );
    const files: Record<string, string> = {};
    for (const [k, v] of entries) files[k] = v;
    files['content.xml'] = files['content.xml']!.replace(
      '<text:p>Two lines</text:p>',
      '<text:p>Two lines, edited</text:p>',
    );
    const made = await readBack(zipOf(files), 'ods');
    const [one] = placed(made);
    expect(one!.threads.map((t) => t.at)).toEqual(['C3:C3']);
    expect(one!.notes).toEqual([
      ['A1', 'Is this final?\nTwo lines, edited\nBo Lee: Yes @priya'],
      ['C3', 'A note too'],
    ]);
  });
});
