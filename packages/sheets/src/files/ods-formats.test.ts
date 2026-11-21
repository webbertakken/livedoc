// docs/specs/029-sheets/standard-mapping.md "Number formats in the file" (D93, D94): number formats through ODF, both
// forms, written as data and cell styles, read from a cell's own style, its row's or its column's, from content.xml
// and styles.xml; what cannot travel is named.
import { ODF_NS, writeOdfPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { ODS_FORMAT_REPEAT_MAX, readOds } from './ods-read';
import { writeFlatOds, writeOds } from './ods-write';
import type { WorkbookFile } from './workbook-file';

const encode = (text: string) => new TextEncoder().encode(text);
const NS = Object.entries(ODF_NS)
  .map(([p, uri]) => `xmlns:${p}="${uri}"`)
  .join(' ');

const file: WorkbookFile = {
  sheets: [
    {
      name: 'S',
      rows: 3,
      cols: 3,
      cells: [
        { r: 0, c: 0, value: { k: 'n', v: 1234.5 }, format: '#,##0.00' },
        { r: 0, c: 1, value: { k: 'n', v: 0.25 }, format: '0.0%' },
        { r: 0, c: 2, value: { k: 'n', v: 2 }, format: '#,##0.00' },
        { r: 1, c: 0, format: 'dd/mm/yyyy' },
        { r: 1, c: 1, value: { k: 'n', v: 0.5 }, format: '# ?/?' },
        {
          r: 2,
          c: 0,
          value: { k: 'n', v: 1 },
          format: '_("£"* #,##0.00_);_("£"* \\(#,##0.00\\);_("£"* "-"??_);_(@_)',
        },
      ],
    },
  ],
};

describe('number formats written to ODF', () => {
  it('names a data style and a cell style per format, in order of first use, and a format ODF cannot say', () => {
    const { data, losses } = writeFlatOds(file, 'T');
    expect(losses).toEqual([{ k: 'format_unwritten', sheet: 'S', r: 1, c: 1 }]);
    const lines = data.split('\n');
    expect(lines).toContain(
      '<style:style style:name="ce1" style:family="table-cell" style:data-style-name="N1"/>',
    );
    expect(lines.indexOf('<office:automatic-styles>')).toBeLessThan(lines.indexOf('<office:body>'));
    expect(lines).toContain(
      '<table:table-cell table:style-name="ce1" office:value-type="float" office:value="1234.5"><text:p>1234.5</text:p></table:table-cell>',
    );
    expect(lines).toContain('<table:table-cell table:style-name="ce3"></table:table-cell>');
    expect(data).toContain(`xmlns:number="${ODF_NS.number}"`);
  });

  it('writes no styles when no cell has a format', () => {
    expect(
      writeFlatOds({ sheets: [{ name: 'S', rows: 1, cols: 1, cells: [] }] }, 'T').data,
    ).not.toContain('automatic-styles');
  });

  it('reads back each format it wrote, both forms', async () => {
    for (const bytes of [writeOds(file, 'T').data, encode(writeFlatOds(file, 'T').data)]) {
      const read = await readOds(bytes);
      if (!read.ok) throw new Error(read.rejection);
      expect(read.file.sheets[0]!.cells.map((c) => [c.r, c.c, c.format])).toEqual([
        [0, 0, '#,##0.00'],
        [0, 1, '0.0%'],
        [0, 2, '#,##0.00'],
        [1, 0, 'dd/mm/yyyy'],
        [1, 1, undefined],
        [2, 0, file.sheets[0]!.cells[5]!.format],
      ]);
      expect(read.losses).toEqual([]);
    }
  });
});

// A flat document as another maker writes one: styles in office:styles and automatic ones, defaults on lines.
function flat(styles: string, automatic: string, table: string): Uint8Array<ArrayBuffer> {
  return encode(
    `<?xml version="1.0"?><office:document ${NS} office:mimetype="application/vnd.oasis.opendocument.spreadsheet">` +
      `<office:styles>${styles}</office:styles><office:automatic-styles>${automatic}</office:automatic-styles>` +
      `<office:body><office:spreadsheet><table:table table:name="S">${table}</table:table></office:spreadsheet></office:body></office:document>`,
  );
}

const PERCENT =
  '<number:percentage-style style:name="P"><number:number number:decimal-places="1" number:min-integer-digits="1"/><number:text>%</number:text></number:percentage-style>';
const DATE =
  '<number:date-style style:name="D"><number:year number:style="long"/><number:text>-</number:text><number:month number:style="long"/></number:date-style>';
const QUARTER = '<number:date-style style:name="Q"><number:quarter/></number:date-style>';

describe('number formats read from other makers’ ODF', () => {
  it('reads a cell’s own style, its row’s, its column’s, a named style’s parent, and names what it cannot hold', async () => {
    const read = await readOds(
      flat(
        `${PERCENT}<style:style style:name="Named" style:family="table-cell" style:data-style-name="P"/>`,
        `${DATE}${QUARTER}<style:style style:name="ce1" style:family="table-cell" style:parent-style-name="Named"/>` +
          '<style:style style:name="ce2" style:family="table-cell" style:data-style-name="D"/>' +
          '<style:style style:name="ce3" style:family="table-cell" style:data-style-name="Q"/>' +
          '<style:style style:name="Plain" style:family="table-cell"/><number:number-style/>',
        '<table:table-columns><table:table-column table:default-cell-style-name="ce2" table:number-columns-repeated="2"/></table:table-columns>' +
          '<table:table-column table:default-cell-style-name="Plain"/><office:forms/>' +
          '<table:table-row><table:table-cell table:style-name="ce1" office:value-type="float" office:value="0.5"/>' +
          '<table:table-cell office:value-type="float" office:value="1"/><table:table-cell office:value-type="float" office:value="1"/></table:table-row>' +
          '<table:table-row table:default-cell-style-name="ce3"><table:table-cell office:value-type="float" office:value="2"/>' +
          `<table:table-cell table:style-name="ce1" table:number-columns-repeated="2"/></table:table-row>` +
          `<table:table-row table:number-rows-repeated="${ODS_FORMAT_REPEAT_MAX + 1}"><table:table-cell table:style-name="ce1"/></table:table-row>`,
      ),
    );
    if (!read.ok) throw new Error(read.rejection);
    expect(read.file.sheets[0]!.cells).toEqual([
      { r: 0, c: 0, value: { k: 'n', v: 0.5 }, format: '0.0%' },
      { r: 0, c: 1, value: { k: 'n', v: 1 }, format: 'yyyy-mm' },
      { r: 0, c: 2, value: { k: 'n', v: 1 } },
      { r: 1, c: 0, value: { k: 'n', v: 2 } },
      { r: 1, c: 1, format: '0.0%' },
      { r: 1, c: 2, format: '0.0%' },
    ]);
    expect(read.losses).toEqual([
      { k: 'format_approximated', sheet: 'S', code: '' },
      { k: 'formats_cut', sheet: 'S' },
    ]);
  });

  it('reads named styles from a package’s styles.xml, and none from one it cannot read', async () => {
    const content = (cells: string) =>
      encode(
        `<office:document-content ${NS}><office:body><office:spreadsheet><table:table table:name="S"><table:table-row>${cells}</table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`,
      );
    const styles = encode(
      `<office:document-styles ${NS}><office:styles>${PERCENT}<style:style style:name="Named" style:family="table-cell" style:data-style-name="P"/></office:styles></office:document-styles>`,
    );
    const cell =
      '<table:table-cell table:style-name="Named" office:value-type="float" office:value="1"/>';
    const pkg = (entries: { name: string; data: Uint8Array }[]) =>
      writeOdfPackage(
        'application/vnd.oasis.opendocument.spreadsheet',
        entries.map((e) => ({ ...e, mediaType: 'text/xml' })),
      );
    const withStyles = await readOds(
      pkg([
        { name: 'content.xml', data: content(cell) },
        { name: 'styles.xml', data: styles },
      ]),
    );
    expect(withStyles.ok && withStyles.file.sheets[0]!.cells[0]!.format).toBe('0.0%');
    const broken = await readOds(
      pkg([
        { name: 'content.xml', data: content(cell) },
        { name: 'styles.xml', data: encode('<office:') },
      ]),
    );
    expect(broken.ok && broken.file.sheets[0]!.cells[0]!.format).toBeUndefined();
  });
});

describe('values a maker leaves bare', () => {
  // standard-mapping.md "What the model holds": a date or time with no value is none; a duration of minutes alone.
  it('reads a date or time without its value as none, and a duration without hours', async () => {
    const read = await readOds(
      encode(
        `<?xml version="1.0"?><office:document ${NS} office:mimetype="application/vnd.oasis.opendocument.spreadsheet">` +
          '<office:spreadsheet><table:table table:name="S"><table:table-row>' +
          '<table:table-cell office:value-type="date"/><table:table-cell office:value-type="time"/>' +
          '<table:table-cell office:value-type="time" office:time-value="PT36M"/>' +
          '</table:table-row></table:table></office:spreadsheet></office:document>',
      ),
    );
    expect(read.ok && read.file.sheets[0]!.cells).toEqual([
      { r: 0, c: 2, value: { k: 'n', v: 0.025 } },
    ]);
  });
});

describe('cells with little to say', () => {
  it('writes a false and a cell of nothing', () => {
    const { data } = writeFlatOds(
      {
        sheets: [
          {
            name: 'S',
            rows: 1,
            cols: 2,
            cells: [
              { r: 0, c: 0, value: { k: 'b', v: false } },
              { r: 0, c: 1 },
            ],
          },
        ],
      },
      'T',
    );
    expect(data).toContain('office:boolean-value="false"><text:p>FALSE</text:p>');
    expect(data).toContain('<table:table-cell></table:table-cell>');
  });
});
