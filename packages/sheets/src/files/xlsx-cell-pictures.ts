// Pictures in cells in XLSX (docs/specs/029-sheets/standard-mapping.md "Pictures in the file", "Pictures in a cell",
// D634), as Excel writes a picture placed in a cell: the cell an error `#VALUE!` (what a reader without rich values
// shows) whose `vm` names a value metadata block of `xl/metadata.xml`, pointing at a rich value of the `_localImage`
// structure in `xl/richData/`, whose relationship names the picture's bytes in `xl/media` (shared with the drawings').
// Each picture and alt text is one rich value however many cells hold it; each image one relationship.
import {
  escapeXmlText,
  OOXML_CONTENT_TYPES,
  RELATIONSHIP_TYPES,
  XML_DECLARATION,
  type OoxmlPart,
  type Relationship,
} from '@livedoc/office-packages';
import { cellPictureBytes, type FilePictureBytes, type FilePictureFetches } from './file-pictures';
import type { FileCell, FileLoss, FileSheet } from './workbook-file';
import { OFFICE_RELATIONSHIPS_NS, SPREADSHEETML_NS } from './xlsx-parts';

export const RICH_DATA_NS = 'http://schemas.microsoft.com/office/spreadsheetml/2017/richdata';
export const RICH_DATA2_NS = 'http://schemas.microsoft.com/office/spreadsheetml/2017/richdata2';
export const RICH_VALUE_REL_NS =
  'http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel';
// The future metadata extension a rich value's block is held in.
export const RICH_VALUE_EXT = '{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}';
export const LOCAL_IMAGE = '_localImage';
export const LOCAL_IMAGE_KEY = '_rvRel:LocalImageIdentifier';
// Where Excel says a picture placed in a cell came from: 5, inserted (the value Excel writes, verified on its file).
const CALC_ORIGIN = 5;

/** Where each of the workbook's rich data parts is written, from `xl/`. */
export const RICH_DATA_PARTS = {
  values: 'richData/rdrichvalue.xml',
  structures: 'richData/rdrichvaluestructure.xml',
  types: 'richData/rdRichValueTypes.xml',
  rels: 'richData/richValueRel.xml',
} as const;

/** The workbook's pictures in cells as written: each cell's value metadata index, the parts and their relationships. */
export type XlsxCellPictures = {
  // The 1-based `vm` of a cell whose picture is written; none for a cell left without it.
  vmOf: (cell: FileCell) => number | undefined;
  // How many rich values `xl/metadata.xml` names.
  values: number;
  parts: OoxmlPart[];
  // The rich value relationships part's relationships to the media.
  relationships: [string, Relationship[]][];
  // The workbook's relationships to the rich data parts (its ids given by the writer).
  workbook: { type: string; target: string }[];
};

const encode = (xml: string) => new TextEncoder().encode(`${XML_DECLARATION}\n${xml}\n`);

// Excel's rich value types part, as it writes it (verified on its file): which keys a comparison of values leaves out.
const TYPES_XML =
  `<rvTypesInfo xmlns="${RICH_DATA2_NS}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ` +
  `mc:Ignorable="x" xmlns:x="${SPREADSHEETML_NS}"><global><keyFlags>` +
  '<key name="_Self"><flag name="ExcludeFromFile" value="1"/><flag name="ExcludeFromCalcComparison" value="1"/></key>' +
  [
    '_DisplayString',
    '_Flags',
    '_Format',
    '_SubLabel',
    '_Attribution',
    '_Icon',
    '_Display',
    '_CanonicalPropertyNames',
    '_ClassificationId',
  ]
    .map((key) => `<key name="${key}"><flag name="ExcludeFromCalcComparison" value="1"/></key>`)
    .join('') +
  '</keyFlags></global></rvTypesInfo>';

// The `_localImage` structures: without alt text, and with it as `Text`.
const STRUCTURE_KEYS = {
  plain: [`<k n="${LOCAL_IMAGE_KEY}" t="i"/>`, '<k n="CalcOrigin" t="i"/>'],
  alt: [`<k n="${LOCAL_IMAGE_KEY}" t="i"/>`, '<k n="CalcOrigin" t="i"/>', '<k n="Text" t="s"/>'],
} as const;

/**
 * The workbook's pictures in cells, in sheet and cell order; one whose bytes the download did not read is named left
 * out (`picture_unwritten`) and its cell written without it. `media` names (once) an image's part in `xl/media`.
 */
export function xlsxCellPictures(
  sheets: readonly FileSheet[],
  media: (imageId: string, bytes: FilePictureBytes) => string,
  fetches: FilePictureFetches | undefined,
  losses: FileLoss[],
): XlsxCellPictures {
  const vms = new Map<FileCell, number>();
  const values = new Map<string, number>();
  const valueXml: string[] = [];
  const rels = new Map<string, number>();
  const relTargets: string[] = [];
  const structures: (keyof typeof STRUCTURE_KEYS)[] = [];
  for (const sheet of sheets)
    for (const cell of sheet.cells) {
      if (!cell.picture) continue;
      const bytes = cellPictureBytes(sheet.name, cell.picture, fetches, losses);
      if (!bytes) continue;
      const { imageId, alt } = cell.picture;
      const key = JSON.stringify([imageId, alt ?? null]);
      let value = values.get(key);
      if (value === undefined) {
        let rel = rels.get(imageId);
        if (rel === undefined) {
          rel = relTargets.length;
          rels.set(imageId, rel);
          relTargets.push(`../${media(imageId, bytes).slice('xl/'.length)}`);
        }
        const kind = alt ? 'alt' : 'plain';
        if (!structures.includes(kind)) structures.push(kind);
        const text = alt ? `<v>${escapeXmlText(alt)}</v>` : '';
        valueXml.push(
          `<rv s="${structures.indexOf(kind)}"><v>${rel}</v><v>${CALC_ORIGIN}</v>${text}</rv>`,
        );
        value = valueXml.length;
        values.set(key, value);
      }
      vms.set(cell, value);
    }
  const out: XlsxCellPictures = {
    vmOf: (cell) => vms.get(cell),
    values: valueXml.length,
    parts: [],
    relationships: [],
    workbook: [],
  };
  if (valueXml.length === 0) return out;
  const part = (name: string, contentType: string, xml: string, type: string) => {
    out.parts.push({ name: `xl/${name}`, contentType, data: encode(xml) });
    out.workbook.push({ type, target: name });
  };
  part(
    RICH_DATA_PARTS.values,
    OOXML_CONTENT_TYPES.richValue,
    `<rvData xmlns="${RICH_DATA_NS}" count="${valueXml.length}">${valueXml.join('')}</rvData>`,
    RELATIONSHIP_TYPES.richValue,
  );
  part(
    RICH_DATA_PARTS.structures,
    OOXML_CONTENT_TYPES.richValueStructure,
    `<rvStructures xmlns="${RICH_DATA_NS}" count="${structures.length}">${structures
      .map((kind) => `<s t="${LOCAL_IMAGE}">${STRUCTURE_KEYS[kind].join('')}</s>`)
      .join('')}</rvStructures>`,
    RELATIONSHIP_TYPES.richValueStructure,
  );
  part(
    RICH_DATA_PARTS.types,
    OOXML_CONTENT_TYPES.richValueTypes,
    TYPES_XML,
    RELATIONSHIP_TYPES.richValueTypes,
  );
  part(
    RICH_DATA_PARTS.rels,
    OOXML_CONTENT_TYPES.richValueRel,
    `<richValueRels xmlns="${RICH_VALUE_REL_NS}" xmlns:r="${OFFICE_RELATIONSHIPS_NS}">${relTargets
      .map((_, n) => `<rel r:id="rId${n + 1}"/>`)
      .join('')}</richValueRels>`,
    RELATIONSHIP_TYPES.richValueRel,
  );
  out.relationships.push([
    `xl/${RICH_DATA_PARTS.rels}`,
    relTargets.map((target, n) => ({ id: `rId${n + 1}`, type: RELATIONSHIP_TYPES.image, target })),
  ]);
  return out;
}

// Excel's flags on a metadata type: how a value of it copies, pastes, merges and shifts (verified on its files).
const TYPE_FLAGS =
  'minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" ' +
  'clearFormats="1" clearComments="1" assign="1" coerce="1"';

/**
 * `xl/metadata.xml`, or null when the workbook needs none: dynamic arrays' cell metadata (a spilling formula's `cm`
 * of 1) and the rich values' value metadata (a picture cell's `vm`, 1 to `values`), as Excel writes both.
 */
export function xlsxMetadataXml(dynamic: boolean, values: number): string | null {
  if (!dynamic && values === 0) return null;
  const types: string[] = [];
  const future: string[] = [];
  let cell = '';
  let value = '';
  if (dynamic) {
    types.push(`<metadataType name="XLDAPR" ${TYPE_FLAGS} cellMeta="1"/>`);
    future.push(
      '<futureMetadata name="XLDAPR" count="1"><bk><extLst><ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}">' +
        '<xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata>',
    );
    cell = `<cellMetadata count="1"><bk><rc t="${types.length}" v="0"/></bk></cellMetadata>`;
  }
  if (values > 0) {
    types.push(`<metadataType name="XLRICHVALUE" ${TYPE_FLAGS}/>`);
    const blocks = Array.from(
      { length: values },
      (_, i) => `<bk><extLst><ext uri="${RICH_VALUE_EXT}"><xlrd:rvb i="${i}"/></ext></extLst></bk>`,
    );
    future.push(
      `<futureMetadata name="XLRICHVALUE" count="${values}">${blocks.join('')}</futureMetadata>`,
    );
    const t = types.length;
    value = `<valueMetadata count="${values}">${Array.from(
      { length: values },
      (_, i) => `<bk><rc t="${t}" v="${i}"/></bk>`,
    ).join('')}</valueMetadata>`;
  }
  const ns = [
    `xmlns="${SPREADSHEETML_NS}"`,
    ...(dynamic
      ? ['xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray"']
      : []),
    ...(values > 0 ? [`xmlns:xlrd="${RICH_DATA_NS}"`] : []),
  ];
  return (
    `<metadata ${ns.join(' ')}><metadataTypes count="${types.length}">${types.join('')}</metadataTypes>` +
    `${future.join('')}${cell}${value}</metadata>`
  );
}
