// Files written by hand as other makers write them, for the readers' tests: an XLSX package of hand-written parts,
// and a flat ODF document of hand-written styles and one table.
import {
  ODF_NS,
  OOXML_CONTENT_TYPES,
  RELATIONSHIP_TYPES,
  writeOoxmlPackage,
  type OoxmlPart,
  type Relationship,
} from '@livedoc/office-packages';
import { SPREADSHEETML_NS } from '../files/xlsx-parts';

const encode = (text: string) => new TextEncoder().encode(text);

/** Every ODF namespace bound by its usual prefix. */
export const ODF_NAMESPACES = Object.entries(ODF_NS)
  .map(([p, uri]) => `xmlns:${p}="${uri}"`)
  .join(' ');

// A package from hand-written parts, as other makers write them.
export function xlsx(
  sheets: string[],
  options: {
    workbook?: string;
    strings?: string;
    styles?: string;
    mediaType?: string;
    rels?: Relationship[];
    // Each worksheet's children before and after its `sheetData`, by its place.
    around?: readonly { before?: string; after?: string }[];
  } = {},
): Uint8Array<ArrayBuffer> {
  const ns = `xmlns="${SPREADSHEETML_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
  const parts: OoxmlPart[] = [
    {
      name: 'xl/workbook.xml',
      contentType: options.mediaType ?? OOXML_CONTENT_TYPES.spreadsheet,
      data: encode(
        options.workbook ??
          `<workbook ${ns}><sheets>${sheets.map((_, i) => `<sheet name="S${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
      ),
    },
    ...sheets.map((xml, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      contentType: OOXML_CONTENT_TYPES.worksheet,
      data: encode(
        `<worksheet ${ns}>${options.around?.[i]?.before ?? ''}<sheetData>${xml}</sheetData>${options.around?.[i]?.after ?? ''}</worksheet>`,
      ),
    })),
  ];
  const rels: Relationship[] =
    options.rels ??
    sheets.map((_, i) => ({
      id: `rId${i + 1}`,
      type: RELATIONSHIP_TYPES.worksheet,
      target: `worksheets/sheet${i + 1}.xml`,
    }));
  if (options.strings !== undefined) {
    parts.push({
      name: 'xl/sharedStrings.xml',
      contentType: OOXML_CONTENT_TYPES.sharedStrings,
      data: encode(options.strings),
    });
    rels.push({ id: 'rS', type: RELATIONSHIP_TYPES.sharedStrings, target: 'sharedStrings.xml' });
  }
  if (options.styles !== undefined) {
    parts.push({
      name: 'xl/styles.xml',
      contentType: OOXML_CONTENT_TYPES.spreadsheetStyles,
      data: encode(options.styles),
    });
    rels.push({ id: 'rT', type: RELATIONSHIP_TYPES.styles, target: 'styles.xml' });
  }
  return writeOoxmlPackage(
    parts,
    new Map([
      ['', [{ id: 'rId1', type: RELATIONSHIP_TYPES.officeDocument, target: 'xl/workbook.xml' }]],
      ['xl/workbook.xml', rels],
    ]),
  );
}

// A flat document as another maker writes one: styles in office:styles and automatic ones, defaults on lines.
export function flatOds(styles: string, automatic: string, table: string): Uint8Array<ArrayBuffer> {
  return encode(
    `<?xml version="1.0"?><office:document ${ODF_NAMESPACES} office:mimetype="application/vnd.oasis.opendocument.spreadsheet">` +
      `<office:styles>${styles}</office:styles><office:automatic-styles>${automatic}</office:automatic-styles>` +
      `<office:body><office:spreadsheet><table:table table:name="S">${table}</table:table></office:spreadsheet></office:body></office:document>`,
  );
}
