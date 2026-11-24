// docs/specs/029-sheets/standard-mapping.md "Cell styles in the file", "Unknown content", D104: a sheet whose cells,
// rows or columns name a style saying more than the model holds is named by the read (`styles_unread`), in both formats.
import {
  ODF_NS,
  OOXML_CONTENT_TYPES,
  RELATIONSHIP_TYPES,
  writeOoxmlPackage,
} from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { readOds } from './ods-read';
import type { FileRead } from './workbook-file';
import { SPREADSHEETML_NS } from './xlsx-parts';
import { readXlsx } from './xlsx-read';

const encode = (text: string) => new TextEncoder().encode(text);

const TURNED =
  '<style:style style:name="turned" style:family="table-cell"><style:table-cell-properties style:rotation-angle="90"/><style:text-properties fo:font-weight="bold"/></style:style>';
const PLAIN = '<style:style style:name="plain" style:family="table-cell"/>';

function fods(table: string): Uint8Array<ArrayBuffer> {
  const ns = Object.entries(ODF_NS)
    .map(([p, uri]) => `xmlns:${p}="${uri}"`)
    .join(' ');
  return encode(
    `<?xml version="1.0"?><office:document ${ns} office:mimetype="application/vnd.oasis.opendocument.spreadsheet">` +
      `<office:automatic-styles>${TURNED}${PLAIN}</office:automatic-styles><office:body><office:spreadsheet>${table}` +
      '</office:spreadsheet></office:body></office:document>',
  );
}

const lossesOf = async (
  bytes: Uint8Array<ArrayBuffer>,
  read: (bytes: Uint8Array<ArrayBuffer>) => Promise<FileRead> = readOds,
) => {
  const out = await read(bytes);
  if (!out.ok) throw new Error(out.rejection);
  return out.losses.filter((l) => l.k === 'styles_unread');
};

describe('styles past the number format', () => {
  it('names an ODF sheet whose cell, row or column style says more than the model holds', async () => {
    const cell =
      '<table:table table:name="A"><table:table-row><table:table-cell table:style-name="turned"/></table:table-row></table:table>';
    const row =
      '<table:table table:name="B"><table:table-row table:default-cell-style-name="turned"><table:table-cell/></table:table-row></table:table>';
    const column =
      '<table:table table:name="C"><table:table-column table:default-cell-style-name="turned"/><table:table-row><table:table-cell/></table:table-row></table:table>';
    const plain =
      '<table:table table:name="D"><table:table-column/><table:table-row><table:table-cell table:style-name="plain"/></table:table-row></table:table>';
    expect(await lossesOf(fods(cell + row + column + plain))).toEqual([
      { k: 'styles_unread', sheet: 'A' },
      { k: 'styles_unread', sheet: 'B' },
      { k: 'styles_unread', sheet: 'C' },
    ]);
  });

  // standard-mapping.md "Cell styles in the file": what a style says that the model does not hold is named.
  it('names an XLSX sheet whose cells’ styles say more than the model holds', async () => {
    const xlsx = (styles: string, cell: string) =>
      writeOoxmlPackage(
        [
          {
            name: 'xl/workbook.xml',
            contentType: OOXML_CONTENT_TYPES.spreadsheet,
            data: encode(
              `<workbook xmlns="${SPREADSHEETML_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
                '<sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>',
            ),
          },
          {
            name: 'xl/worksheets/sheet1.xml',
            contentType: OOXML_CONTENT_TYPES.worksheet,
            data: encode(
              `<worksheet xmlns="${SPREADSHEETML_NS}"><sheetData><row r="1">${cell}</row></sheetData></worksheet>`,
            ),
          },
          {
            name: 'xl/styles.xml',
            contentType: OOXML_CONTENT_TYPES.spreadsheetStyles,
            data: encode(
              `<styleSheet xmlns="${SPREADSHEETML_NS}"><cellXfs>${styles}</cellXfs></styleSheet>`,
            ),
          },
        ],
        new Map([
          [
            '',
            [{ id: 'rId1', type: RELATIONSHIP_TYPES.officeDocument, target: 'xl/workbook.xml' }],
          ],
          [
            'xl/workbook.xml',
            [
              { id: 'rId1', type: RELATIONSHIP_TYPES.worksheet, target: 'worksheets/sheet1.xml' },
              { id: 'rId2', type: RELATIONSHIP_TYPES.styles, target: 'styles.xml' },
            ],
          ],
        ]),
      );
    // Excel's default alignment and protection, as LibreOffice writes on every style, format nothing.
    const xfs =
      '<xf numFmtId="0"/><xf numFmtId="0" fontId="1"/><xf numFmtId="0"><alignment wrapText="1"/></xf>' +
      '<xf numFmtId="0"><alignment horizontal="general" vertical="bottom" wrapText="false"/><protection locked="true" hidden="false"/></xf>' +
      '<xf numFmtId="0"><protection locked="0"/></xf>' +
      `<xf numFmtId="0"><alignment xmlns:x="urn:x" x:own="1"/></xf>` +
      '<xf numFmtId="0"><alignment justify="1"/></xf><xf numFmtId="0"><extLst/></xf><xf numFmtId="0"><constructor/></xf>';
    expect(await lossesOf(xlsx(xfs, '<c r="A1" s="1"><v>1</v></c>'), readXlsx)).toEqual([]);
    expect(await lossesOf(xlsx(xfs, '<c r="A1" s="2"><v>1</v></c>'), readXlsx)).toEqual([]);
    expect(await lossesOf(xlsx(xfs, '<c r="A1"><v>1</v></c>'), readXlsx)).toEqual([]);
    expect(await lossesOf(xlsx(xfs, '<c r="A1" s="3"><v>1</v></c>'), readXlsx)).toEqual([]);
    expect(await lossesOf(xlsx(xfs, '<c r="A1" s="4"><v>1</v></c>'), readXlsx)).toEqual([
      { k: 'styles_unread', sheet: 'A' },
    ]);
    for (const s of [5, 6, 7, 8])
      expect(await lossesOf(xlsx(xfs, `<c r="A1" s="${s}"><v>1</v></c>`), readXlsx)).toHaveLength(
        1,
      );
  });
});
