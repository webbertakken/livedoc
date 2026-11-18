import { describe, expect, it } from 'vitest';
import { ODF_NS, writeOdfPackage } from '@livedoc/office-packages';
import { readOds } from './ods-read';
import { writeFlatOds, writeOds } from './ods-write';
import type { WorkbookFile } from './workbook-file';

const encode = (text: string) => new TextEncoder().encode(text);

const file: WorkbookFile = {
  sheets: [
    {
      name: 'Budget & Plan',
      rows: 4,
      cols: 3,
      cells: [
        { r: 0, c: 0, value: { k: 'n', v: 2 } },
        { r: 0, c: 1, formula: '=A1*2', value: { k: 'n', v: 4 } },
        { r: 0, c: 2, value: { k: 's', v: 'rent <due>\nmonthly' } },
        { r: 2, c: 1, value: { k: 'b', v: true } },
        { r: 2, c: 2, formula: '=1/0', value: { k: 'e', v: '#DIV/0!' } },
      ],
    },
    { name: 'Costs', rows: 1, cols: 1, cells: [{ r: 0, c: 0, formula: "='Budget & Plan'!A1" }] },
  ],
};

// A flat document around a spreadsheet body, as LibreOffice writes one.
function flat(body: string, mimetype = 'application/vnd.oasis.opendocument.spreadsheet'): Uint8Array<ArrayBuffer> {
  return encode(
    `<?xml version="1.0"?><office:document xmlns:office="${ODF_NS.office}" xmlns:table="${ODF_NS.table}" ` +
      `xmlns:text="${ODF_NS.text}" office:mimetype="${mimetype}"><office:body><office:spreadsheet>${body}` +
      '</office:spreadsheet></office:body></office:document>',
  );
}

async function sheetsOf(bytes: Uint8Array<ArrayBuffer>) {
  const read = await readOds(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return read;
}

describe('writeFlatOds', () => {
  // standard-mapping.md "The flat form": one XML, one cell a line, the same bytes for the same workbook.
  it('writes one cell a line, formulas in OpenFormula beside their cached values', () => {
    const { data, losses } = writeFlatOds(file, 'Budget');
    expect(losses).toEqual([]);
    const lines = data.split('\n');
    expect(lines[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>');
    expect(lines).toContain(
      '<table:table-cell table:formula="of:=[.A1]*2" office:value-type="float" office:value="4"><text:p>4</text:p></table:table-cell>',
    );
    expect(lines).toContain(
      '<table:table-cell office:value-type="string"><text:p>rent &lt;due&gt;</text:p><text:p>monthly</text:p></table:table-cell>',
    );
    expect(lines).toContain(
      '<table:table-cell office:value-type="boolean" office:boolean-value="true"><text:p>TRUE</text:p></table:table-cell>',
    );
    expect(lines).toContain(
      '<table:table-cell table:formula="of:=[$\'Budget &amp; Plan\'.A1]"></table:table-cell>',
    );
    expect(lines).toContain('<table:table table:name="Budget &amp; Plan">');
    expect(lines).toContain('<table:table-row><table:table-cell table:number-columns-repeated="3"/></table:table-row>');
    expect(lines).toContain('<meta:generator>LiveDoc</meta:generator>');
    expect(data).toContain('office:version="1.4"');
    expect(writeFlatOds(file, 'Budget').data).toBe(data);
  });

  it('names a formula OpenFormula cannot say, and keeps its value', () => {
    const { data, losses } = writeFlatOds(
      { sheets: [{ name: 'S', rows: 1, cols: 1, cells: [{ r: 0, c: 0, formula: '=A1#', value: { k: 'n', v: 1 } }] }] },
      'S',
    );
    expect(losses).toEqual([{ k: 'formula_unwritten', sheet: 'S', r: 0, c: 0 }]);
    expect(data).toContain('<table:table-cell office:value-type="float" office:value="1">');
  });

  it('writes an empty sheet as one empty row and column', () => {
    const { data } = writeFlatOds({ sheets: [{ name: 'S', rows: 0, cols: 0, cells: [] }] }, 'S');
    expect(data).toContain('<table:table-column/>\n<table:table-row><table:table-cell/></table:table-row>');
  });
});

describe('readOds', () => {
  // standard-mapping.md: every written file reads back as the workbook it was.
  it('reads back what writeFlatOds and writeOds write', async () => {
    const back = {
      sheets: [
        { ...file.sheets[0]!, rows: 3 },
        { ...file.sheets[1]!, cells: [{ r: 0, c: 0, formula: "='Budget & Plan'!A1" }] },
      ],
    };
    // A cached error is held as the text it shows.
    back.sheets[0]!.cells = back.sheets[0]!.cells.map((c) =>
      c.value?.k === 'e' ? { ...c, value: { k: 's', v: c.value.v } } : c,
    );
    expect((await sheetsOf(encode(writeFlatOds(file, 'B').data))).file).toEqual(back);
    expect((await sheetsOf(writeOds(file, 'B').data)).file).toEqual(back);
  });

  it('unfolds repeats, groups and covered cells, and sizes the sheet by what it holds', async () => {
    const read = await sheetsOf(
      flat(
        '<table:table table:name="S"><table:table-column table:number-columns-repeated="1024"/>' +
          '<table:table-header-rows><table:table-row><table:table-cell office:value-type="string"><text:p>Head</text:p></table:table-cell></table:table-row></table:table-header-rows>' +
          '<table:table-row-group><table:table-row table:number-rows-repeated="2">' +
          '<table:table-cell table:number-columns-repeated="2" office:value-type="float" office:value="7"/>' +
          '<table:covered-table-cell/><foreign/></table:table-row></table:table-row-group>' +
          '<table:table-row table:number-rows-repeated="1048573"><table:table-cell table:number-columns-repeated="1024"/></table:table-row>' +
          '</table:table>',
      ),
    );
    expect(read.file.sheets[0]).toEqual({
      name: 'S',
      rows: 3,
      cols: 2,
      cells: [
        { r: 0, c: 0, value: { k: 's', v: 'Head' } },
        { r: 1, c: 0, value: { k: 'n', v: 7 } },
        { r: 1, c: 1, value: { k: 'n', v: 7 } },
        { r: 2, c: 0, value: { k: 'n', v: 7 } },
        { r: 2, c: 1, value: { k: 'n', v: 7 } },
      ],
    });
    expect(read.losses).toEqual([]);
  });

  it('reads every value type', async () => {
    const cell = (attrs: string, body = '') => `<table:table-cell ${attrs}>${body}</table:table-cell>`;
    const read = await sheetsOf(
      flat(
        '<table:table table:name="T"><table:table-row>' +
          cell('office:value-type="percentage" office:value="0.25"') +
          cell('office:value-type="currency" office:value="9.5"') +
          cell('office:value-type="date" office:date-value="2026-11-18"') +
          cell('office:value-type="date" office:date-value="2026-11-18T12:00:00"') +
          cell('office:value-type="time" office:time-value="PT06H00M00S"') +
          cell('office:value-type="time" office:time-value="-PT12H"') +
          cell('office:value-type="boolean" office:boolean-value="false"') +
          cell('office:value-type="string" office:string-value="given"', '<text:p>shown</text:p>') +
          cell('office:value-type="string"', '<text:p>a<text:s text:c="3"/>b<text:tab/>c<text:line-break/>d<text:s/><text:span>e</text:span><office:annotation><text:p>note</text:p></office:annotation></text:p>') +
          cell('office:value-type="float" office:value="oops"') +
          cell('office:value-type="date" office:date-value="never"') +
          cell('office:value-type="time" office:time-value="soon"') +
          cell('office:value-type="string"', '<text:p></text:p>') +
          cell('office:value-type="void"') +
          cell('office:value-type="string"', '<text:p>x<text:s text:c="0"/>y</text:p>') +
          '</table:table-row></table:table>',
      ),
    );
    expect(read.file.sheets[0]!.cells.map((c) => [c.c, c.value])).toEqual([
      [0, { k: 'n', v: 0.25 }],
      [1, { k: 'n', v: 9.5 }],
      [2, { k: 'n', v: 46344 }],
      [3, { k: 'n', v: 46344.5 }],
      [4, { k: 'n', v: 0.25 }],
      [5, { k: 'n', v: -0.5 }],
      [6, { k: 'b', v: false }],
      [7, { k: 's', v: 'given' }],
      [8, { k: 's', v: 'a   b\tc\nd e' }],
      [14, { k: 's', v: 'x y' }],
    ]);
  });

  it('names a formula it cannot read, keeping the value it showed', async () => {
    const read = await sheetsOf(
      flat(
        '<table:table table:name="F"><table:table-row>' +
          '<table:table-cell table:formula="msoxl:=A1" office:value-type="float" office:value="3"/>' +
          '<table:table-cell table:formula="of:=SUM([.A1])"/>' +
          '</table:table-row></table:table>',
      ),
    );
    expect(read.file.sheets[0]!.cells).toEqual([
      { r: 0, c: 0, value: { k: 'n', v: 3 } },
      { r: 0, c: 1, formula: '=SUM(A1)' },
    ]);
    expect(read.losses).toEqual([{ k: 'formula_unread', sheet: 'F', r: 0, c: 0 }]);
  });

  // spreadsheet.md "Limits": an import past a limit is cut and says so.
  it('cuts a sheet past the grid ceiling and says so', async () => {
    const read = await sheetsOf(
      flat(
        '<table:table><table:table-row table:number-rows-repeated="10001">' +
          '<table:table-cell table:number-columns-repeated="201" office:value-type="float" office:value="1"/>' +
          '</table:table-row></table:table>',
      ),
    );
    expect(read.file.sheets[0]!.name).toBe('');
    expect(read.losses).toEqual([{ k: 'sheet_cut', sheet: '', rows: 10_000, cols: 200 }]);
    expect(read.file.sheets[0]!.rows).toBe(1000);
  });

  it('keeps the first 200 sheets of a file that holds more, and says so', async () => {
    const read = await sheetsOf(flat('<table:table/>'.repeat(201)));
    expect(read.file.sheets).toHaveLength(200);
    expect(read.losses).toEqual([{ k: 'sheets_cut', kept: 200, had: 201 }]);
  });

  it('treats a bad repeat count as one', async () => {
    const read = await sheetsOf(
      flat(
        '<table:table table:name="R"><table:table-row table:number-rows-repeated="-3">' +
          '<table:table-cell table:number-columns-repeated="x" office:value-type="float" office:value="1"/>' +
          '</table:table-row></table:table>',
      ),
    );
    expect(read.file.sheets[0]!.cells).toEqual([{ r: 0, c: 0, value: { k: 'n', v: 1 } }]);
  });

  it.each([
    ['a text document', flat('', 'application/vnd.oasis.opendocument.text'), 'package_wrong_type'],
    ['a flat document with no spreadsheet', encode(`<office:document xmlns:office="${ODF_NS.office}" office:mimetype="application/vnd.oasis.opendocument.spreadsheet"><office:body/></office:document>`), 'package_wrong_type'],
    ['another root', encode('<html/>'), 'package_wrong_type'],
    ['a DOCTYPE', encode('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e "boom">]><x>&e;</x>'), 'xml_doctype_refused'],
    ['bytes that are neither', encode('PK not really'), 'package_damaged'],
    [
      'a text package',
      writeOdfPackage('application/vnd.oasis.opendocument.text', [{ name: 'content.xml', mediaType: 'text/xml', data: encode('<x/>') }]),
      'package_wrong_type',
    ],
    ['a package with no content', writeOdfPackage('application/vnd.oasis.opendocument.spreadsheet', []), 'package_damaged'],
    [
      'a package with malformed content',
      writeOdfPackage('application/vnd.oasis.opendocument.spreadsheet', [{ name: 'content.xml', mediaType: 'text/xml', data: encode('<x>') }]),
      'xml_malformed',
    ],
  ])('refuses %s', async (_, bytes, rejection) => {
    const read = await readOds(bytes as Uint8Array<ArrayBuffer>);
    expect(read.ok ? null : read.rejection).toBe(rejection);
  });
});
