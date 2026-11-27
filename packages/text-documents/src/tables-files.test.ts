// docs/specs/034-text-documents/tables.md "In the formats": tables read from and written to both formats, kept
// properties written back while they hold, Word's table styles' lines read into cells, lenient reads reported.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readOdfPackage, readOoxmlPackage, RELATIONSHIP_TYPES } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { conversionLosses, convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import { Paragraph, type Block } from './model/blocks';
import { Blocks, TEXT_DOCUMENT_TABLE_MAX_COLUMNS, type Table } from './model/tables';
import type { TextDocument } from './model/text-document';
import { CONSTRUCTS } from './testing/constructs';
import { modelOf } from './testing/compare';
import { docx, W_P, W_R } from './testing/packages';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const decoder = new TextDecoder();

const read = async (bytes: Uint8Array) => {
  const result = await readTextDocumentFile(bytes);
  if (!result.ok) throw new Error(result.rejection);
  return result;
};
const write = (document: TextDocument, type: TextDocumentFileType) => {
  const written = writeTextDocumentFile(document, type);
  return written.bytes;
};
const tableOf = (document: TextDocument, at = 0): Table => {
  const table = document.body.filter((b): b is Table => b.type === 'table')[at];
  if (!table) throw new Error('no table');
  return table;
};
const cellTexts = (table: Table) =>
  table.rows.map((row) =>
    row.cells.map((c) => Blocks.paragraphs(c.blocks).map(Paragraph.text).join('|')),
  );
const corpus = (file: string) => readFileSync(join(import.meta.dirname, '..', 'corpus', file));

async function documentXml(bytes: Uint8Array): Promise<string> {
  const pkg = await readOoxmlPackage(new Uint8Array(bytes));
  if (!pkg.ok) throw new Error(pkg.rejection);
  return decoder.decode(pkg.package.parts.get('word/document.xml'));
}
async function contentXml(bytes: Uint8Array): Promise<string> {
  const pkg = await readOdfPackage(new Uint8Array(bytes));
  if (!pkg.ok) throw new Error(pkg.rejection);
  return decoder.decode(pkg.package.entries.get('content.xml'));
}

const ODF_NS = [
  'office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
]
  .map((d) => `xmlns:${d}`)
  .join(' ');
const fodt = (automatic: string, body: string) =>
  new TextEncoder().encode(
    `<?xml version="1.0"?><office:document ${ODF_NS} office:version="1.4" office:mimetype="application/vnd.oasis.opendocument.text"><office:automatic-styles>${automatic}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document>`,
  );
const odfCell = (text: string, attrs = '') =>
  `<table:table-cell${attrs}><text:p>${text}</text:p></table:table-cell>`;
const odfColumns = (n: number) => '<table:table-column/>'.repeat(n);

// Word's own: a table drawn by its style ("Table Grid"), its rows and merges as Word writes them.
const WORD_STYLES = `<?xml version="1.0"?><w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr></w:style></w:styles>`;
const wordDocx = (body: string) =>
  docx(body, {
    rels: `<Relationship Id="rId9" Type="${RELATIONSHIP_TYPES.styles}" Target="styles.xml"/>`,
    entries: [{ name: 'word/styles.xml', data: WORD_STYLES }],
  });
const wc = (text: string, tcPr = '') =>
  `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/>${tcPr}</w:tcPr>${W_P(W_R(text))}</w:tc>`;
const WORD_TABLE = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${wc('H1')}${wc('H2')}${wc('H3')}</w:tr><w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="400" w:hRule="exact"/></w:trPr>${wc('Down', '<w:vMerge w:val="restart"/><w:vAlign w:val="center"/>')}${wc('Across', '<w:gridSpan w:val="2"/><w:shd w:val="clear" w:color="auto" w:fill="D9EAD3"/>')}</w:tr><w:tr>${wc('', '<w:vMerge/>')}${wc('b')}${wc('c', '<w:tcBorders><w:right w:val="nil"/></w:tcBorders><w:tcMar><w:left w:w="200" w:type="dxa"/></w:tcMar>')}</w:tr></w:tbl>${W_P(W_R('After'))}`;

describe('tables in Word files', () => {
  it("reads Word's table: its style's lines into the cells they reach, merges into spans, header rows", async () => {
    const { document, report } = await read(wordDocx(WORD_TABLE));
    const table = tableOf(document);
    expect(report).toEqual({ dropped: [], kept: [] });
    expect(table.columns).toEqual([100, 100, 100]);
    expect(table.align).toBe('center');
    expect(table.headerRows).toBe(1);
    expect(cellTexts(table)).toEqual([
      ['H1', 'H2', 'H3'],
      ['Down', 'Across'],
      ['b', 'c'],
    ]);
    const [down, across] = table.rows[1]!.cells;
    expect(down!.rowSpan).toBe(2);
    expect(down!.props.verticalAlign).toBe('middle');
    expect(across!.colSpan).toBe(2);
    expect(across!.props.background).toBe('#d9ead3');
    expect(table.rows[1]).toMatchObject({ height: 20, heightRule: 'exact', breaks: false });
    const line = { width: 0.5, dash: 'solid', color: '#000000', space: 0 };
    // The style's insideV and right reach "c"; its own right side says none, its own left margin wins.
    const c = table.rows[2]!.cells[1]!;
    expect(c.props.borders).toEqual({ top: line, bottom: line, left: line });
    expect(c.props.padding).toEqual({ top: 0, bottom: 0, left: 10, right: 5.4 });
    expect(table.rows[0]!.cells[0]!.props.borders).toEqual({
      top: line,
      bottom: line,
      left: line,
      right: line,
    });
  });

  it('writes an unedited table back as it came, its style and look kept', async () => {
    const { document } = await read(wordDocx(WORD_TABLE));
    const xml = await documentXml(write(document, 'docx'));
    expect(xml).toContain(
      '<w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/><w:tblLook',
    );
    expect(xml).toContain('<w:trPr><w:tblHeader/></w:trPr>');
    expect(xml).toContain('<w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:vMerge w:val="restart"/>');
    // The row span continues as Word writes it: a cell of the same width, merged on, holding an empty paragraph.
    expect(xml).toMatch(
      /<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"\/><w:vMerge\/>.*?<\/w:tcPr><w:p\/><\/w:tc>/,
    );
    const again = await read(write(document, 'docx'));
    expect(modelOf(again.document)).toEqual(modelOf(document));
  });

  it("rebuilds an edited cell's properties, its lines written whole, the table's style kept", async () => {
    const { document } = await read(wordDocx(WORD_TABLE));
    const table = tableOf(document);
    const [h1, ...rest] = table.rows[0]!.cells;
    const edited: Table = {
      ...table,
      columns: [120, 90, 90],
      rows: [
        {
          ...table.rows[0]!,
          cells: [{ ...h1!, props: { ...h1!.props, background: '#ffff00' } }, ...rest],
        },
        ...table.rows.slice(1),
      ],
    };
    const changed = { ...document, body: document.body.map((b) => (b === table ? edited : b)) };
    const xml = await documentXml(write(changed, 'docx'));
    expect(xml).toContain(
      '<w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="6000" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblLook',
    );
    expect(xml).toContain('<w:gridCol w:w="2400"/><w:gridCol w:w="1800"/>');
    expect(xml).toContain(
      '<w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>',
    );
    expect(xml).toContain('<w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/>');
    const back = tableOf((await read(write(changed, 'docx'))).document);
    expect(back.rows[0]!.cells[0]!.props.background).toBe('#ffff00');
    expect(back.columns).toEqual([120, 90, 90]);
  });

  it('reads a horizontal merge as a span, cells before the grid as empty cells, and wrapped rows, reported', async () => {
    const { document, report } = await read(
      wordDocx(
        `<w:tbl><w:tblGrid><w:gridCol w:w="1000"/><w:gridCol w:w="1000"/><w:gridCol w:w="1000"/></w:tblGrid><w:tr>${wc('a', '<w:hMerge w:val="restart"/>')}${wc('', '<w:hMerge/>')}${wc('b')}</w:tr><w:tr><w:trPr><w:gridBefore w:val="1"/></w:trPr>${wc('c')}${wc('d')}</w:tr><w:sdt><w:sdtContent><w:tr>${wc('e')}${wc('f')}${wc('g')}</w:tr></w:sdtContent></w:sdt></w:tbl>`,
      ),
    );
    const table = tableOf(document);
    expect(cellTexts(table)).toEqual([
      ['a', 'b'],
      ['', 'c', 'd'],
      ['e', 'f', 'g'],
    ]);
    expect(table.rows[0]!.cells[0]!.colSpan).toBe(2);
    expect(report.dropped).toEqual([
      { reason: 'table-content', name: 'sdt', count: 1 },
      { reason: 'table-repaired', name: 'horizontal merge', count: 1 },
    ]);
    // The row read with a place before the grid is written whole, without it.
    const xml = await documentXml(write(document, 'docx'));
    expect(xml).not.toContain('gridBefore');
  });

  it('drops what a table holds besides rows and cells, an empty table, and keeps one past the limits', async () => {
    const grid = (n: number) => `<w:tblGrid>${'<w:gridCol w:w="500"/>'.repeat(n)}</w:tblGrid>`;
    const rows = (n: number) => '<w:tr><w:tc><w:p/></w:tc></w:tr>'.repeat(n);
    const { document, report } = await read(
      wordDocx(
        `<w:tbl><w:tblPr><w:tblInd w:w="720" w:type="dxa"/><w:jc w:val="end"/></w:tblPr>${grid(1)}<w:bookmarkStart w:id="1" w:name="b"/><w:tr><w:bookmarkEnd w:id="1"/><w:sdt><w:sdtContent>${wc('in a control')}</w:sdtContent></w:sdt></w:tr></w:tbl>` +
          `<w:tbl>${grid(1)}</w:tbl>` +
          `<w:tbl>${grid(TEXT_DOCUMENT_TABLE_MAX_COLUMNS + 1)}${rows(1)}</w:tbl>` +
          `<w:tbl>${grid(1)}${rows(1001)}</w:tbl>${W_P('')}`,
      ),
    );
    const table = tableOf(document);
    expect([table.indent, table.align]).toEqual([36, 'end']);
    expect(cellTexts(table)).toEqual([['in a control']]);
    expect(document.body.map((b) => b.type)).toEqual(['table', 'kept', 'kept', 'paragraph']);
    expect(report.kept).toEqual([{ name: 'tbl', count: 2 }]);
    expect(report.dropped).toEqual([
      { reason: 'table-content', name: 'bookmarkStart', count: 1 },
      { reason: 'table-content', name: 'bookmarkEnd', count: 1 },
      { reason: 'table-content', name: 'sdt', count: 1 },
      { reason: 'table-repaired', name: 'empty table', count: 1 },
    ]);
  });

  it('writes an empty paragraph after a table ending a cell, as a cell must end with one', async () => {
    const document = CONSTRUCTS.tables!('ooxml');
    const table = tableOf(document);
    const inner = table.rows[2]!.cells[1]!;
    const edited: Table = {
      ...table,
      rows: [
        ...table.rows.slice(0, 2),
        {
          ...table.rows[2]!,
          cells: [table.rows[2]!.cells[0]!, { ...inner, blocks: inner.blocks.slice(0, 2) }],
        },
      ],
    };
    const xml = await documentXml(
      write({ ...document, body: document.body.map((b) => (b === table ? edited : b)) }, 'docx'),
    );
    expect(xml).toMatch(/<\/w:tbl><w:p\/><\/w:tc>/);
  });
});

describe('tables in OpenDocument files', () => {
  it("reads LibreOffice's table: its columns, merged cells, lines and padding", async () => {
    const { document } = await read(corpus('libreoffice/rich.fodt'));
    const table = tableOf(document);
    expect(cellTexts(table)).toEqual([['Name', 'Value'], ['Alpha', '1'], ['Merged']]);
    expect(table.rows[2]!.cells[0]!.colSpan).toBe(2);
    expect(table.columns.length).toBe(2);
    expect(table.rows[0]!.cells[0]!.props.borders?.top).toMatchObject({ dash: 'solid' });
  });

  it('writes header rows, covered places, and styles named by what they hold', async () => {
    const xml = await contentXml(write(CONSTRUCTS.tables!('odf'), 'odt'));
    expect(xml).toMatch(/<table:table table:name="Table1" table:style-name="LDTable[0-9a-f]{8}">/);
    expect(xml).toMatch(/<table:table-header-rows><table:table-row>/);
    expect(xml).toMatch(
      /table:number-columns-spanned="2">.*?<\/table:table-cell><table:covered-table-cell\/>/,
    );
    expect(xml).toContain('<table:covered-table-cell/></table:table-row></table:table>');
    expect(xml).toMatch(
      /<style:table-row-properties style:row-height="36pt" fo:keep-together="always"\/>/,
    );
    expect(xml).toContain('<table:table table:name="Table2"');
  });

  it("keeps a table's own name and its style while they hold, naming a new table past the names kept", async () => {
    const bytes = fodt(
      '<style:style style:name="T9" style:family="table"><style:table-properties style:width="2in" table:align="right" style:shadow="none"/></style:style>',
      `<table:table table:name="Table1" table:style-name="T9" table:template-name="Default Style">${odfColumns(1)}<table:table-row>${odfCell('x')}</table:table-row></table:table>`,
    );
    const { document } = await read(bytes);
    const table = tableOf(document);
    expect(table.align).toBe('end');
    const added: TextDocument = {
      ...document,
      body: [...document.body, { ...table, kept: undefined, tag: undefined }],
    };
    const xml = decoder.decode(write(added, 'fodt'));
    expect(xml).toContain(
      '<table:table table:style-name="T9" table:name="Table1" table:template-name="Default Style">',
    );
    expect(xml).toContain(
      '<style:table-properties style:width="2in" table:align="right" style:shadow="none"/>',
    );
    expect(xml).toMatch(/<table:table table:name="Table2" table:style-name="LDTable/);
    expect(conversionLosses(document, 'ooxml')).toContainEqual({
      kind: 'table-style',
      name: 'table-style',
      count: 1,
    });
  });

  it('fills short rows, widens for long ones, cuts spans past the edge, and drops a table with no rows, reported', async () => {
    const { document, report } = await read(
      fodt(
        '',
        `<table:table>${odfColumns(2)}<table:table-row>${odfCell('a', ' table:number-rows-spanned="9"')}</table:table-row><table:table-row>${odfCell('b')}${odfCell('c')}</table:table-row></table:table><table:table>${odfColumns(1)}</table:table>`,
      ),
    );
    const table = tableOf(document);
    expect(cellTexts(table)).toEqual([
      ['a', '', ''],
      ['b', 'c'],
    ]);
    expect(table.columns.length).toBe(3);
    expect(document.body.filter((b) => b.type === 'table')).toHaveLength(1);
    expect(report.dropped).toEqual([
      { reason: 'table-repaired', name: 'span past the edge', count: 1 },
      { reason: 'table-repaired', name: 'long row', count: 1 },
      { reason: 'table-repaired', name: 'short row', count: 1 },
      { reason: 'table-repaired', name: 'empty table', count: 1 },
    ]);
  });

  it('keeps a table past the column limit as a kept block, reported as kept', async () => {
    const columns = TEXT_DOCUMENT_TABLE_MAX_COLUMNS + 1;
    const { document, report } = await read(
      fodt(
        '',
        `<table:table><table:table-column table:number-columns-repeated="${columns}"/><table:table-row>${odfCell('x', ` table:number-columns-repeated="${columns}"`)}</table:table-row></table:table>`,
      ),
    );
    expect(document.body.map((b: Block) => b.type)).toEqual(['kept', 'paragraph']);
    expect(report.kept).toEqual([{ name: 'table', count: 1 }]);
  });

  it('reads rows in groups, header rows as the leading ones, and drops what else a table or row holds', async () => {
    const { document, report } = await read(
      fodt(
        '',
        `<table:table><table:table-column-group>${odfColumns(2)}</table:table-column-group><table:title>Caption</table:title><table:table-header-rows><table:table-row>${odfCell('h1')}${odfCell('h2')}</table:table-row></table:table-header-rows><table:table-rows><table:table-row>${odfCell('a')}<text:p>stray</text:p>${odfCell('b')}</table:table-row></table:table-rows><table:table-header-rows><table:table-row>${odfCell('late')}${odfCell('header')}</table:table-row></table:table-header-rows></table:table>`,
      ),
    );
    const table = tableOf(document);
    expect(table.headerRows).toBe(1);
    expect(cellTexts(table)).toEqual([
      ['h1', 'h2'],
      ['a', 'b'],
      ['late', 'header'],
    ]);
    expect(report.dropped).toEqual([
      { reason: 'table-content', name: 'title', count: 1 },
      { reason: 'table-content', name: 'p', count: 1 },
    ]);
  });

  it('reads repeated rows and cells, and column widths relative to the table', async () => {
    const { document } = await read(
      fodt(
        '<style:style style:name="T" style:family="table"><style:table-properties style:width="300pt"/></style:style><style:style style:name="C1" style:family="table-column"><style:table-column-properties style:rel-column-width="1*"/></style:style><style:style style:name="C2" style:family="table-column"><style:table-column-properties style:rel-column-width="2*"/></style:style>',
        `<table:table table:style-name="T"><table:table-column table:style-name="C1"/><table:table-column table:style-name="C2"/><table:table-row table:number-rows-repeated="2">${odfCell('r', ' table:number-columns-repeated="2"')}</table:table-row></table:table>`,
      ),
    );
    const table = tableOf(document);
    expect(table.columns).toEqual([100, 200]);
    expect(cellTexts(table)).toEqual([
      ['r', 'r'],
      ['r', 'r'],
    ]);
  });
});

describe('tables converted', () => {
  it.each([
    ['odf', 'ooxml', 'docx'],
    ['ooxml', 'odf', 'odt'],
  ] as const)('carries every table value from %s to %s', async (from, to, type) => {
    const { document, losses } = convertTextDocument(CONSTRUCTS.tables!(from), to);
    expect(losses).toEqual([]);
    const back = await read(write(document, type));
    expect(modelOf(back.document)).toEqual(modelOf(document));
  });

  it("carries Word's table with its style's lines into the cells, the style itself a listed loss", async () => {
    const word = (await read(wordDocx(WORD_TABLE))).document;
    expect(conversionLosses(word, 'odf')).toEqual([
      { kind: 'table-style', name: 'table-style', count: 1 },
    ]);
    const { document } = convertTextDocument(word, 'odf');
    const table = tableOf(document);
    expect(table.kept).toBeUndefined();
    expect(table.rows[0]!.cells[0]!.props.borders?.top?.width).toBe(0.5);
    const back = tableOf((await read(write(document, 'odt'))).document);
    expect(back.rows[0]!.cells[0]!.props).toEqual(table.rows[0]!.cells[0]!.props);
  });
});
