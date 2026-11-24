// Files holding what the model does not (docs/specs/029-sheets/standard-mapping.md "Unknown content"), as LibreOffice
// and Excel write them: what the kept content tests read and the schema validation writes back. Test data, never shipped.
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

export const CONFIG = 'urn:oasis:names:tc:opendocument:xmlns:config:1.0';

export const VALIDATIONS =
  '<table:content-validations><table:content-validation table:name="val1" table:condition="of:cell-content-is-whole-number()"/></table:content-validations>';
export const TRACKED = '<table:tracked-changes table:track-changes="false"/>';
export const NAMES =
  '<table:named-expressions><table:named-range table:name="Total" table:base-cell-address="$Sheet1.$A$1" table:cell-range-address="$Sheet1.$A$1"/></table:named-expressions>';
export const SHAPES =
  '<table:shapes><draw:frame draw:style-name="gr1" svg:width="2cm" svg:height="1cm" svg:x="1cm" svg:y="1cm"><draw:image xlink:href="Pictures/cat.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></table:shapes>';
export const FORMATS =
  '<calcext:conditional-formats><calcext:conditional-format calcext:target-range-address="Sheet1.A1:Sheet1.A2"/></calcext:conditional-formats>';
export const NOTE =
  '<office:annotation><dc:creator>Ann</dc:creator><text:p text:style-name="P1">Check</text:p></office:annotation>';
export const GRAPHIC =
  '<style:style style:name="gr1" style:family="graphic"><style:graphic-properties draw:stroke="none"/></style:style>';
export const PARAGRAPH = '<style:style style:name="P1" style:family="paragraph"/>';
export const CELL_STYLE =
  '<style:style style:name="ce9" style:family="table-cell"/><style:style style:name="none"/>';
export const SCRIPTS = '<office:scripts/>';
export const SETTINGS =
  '<office:settings><config:config-item-set config:name="ooo:view-settings"><config:config-item config:name="VisibleAreaTop" config:type="int">0</config:config-item></config:config-item-set></office:settings>';

// A flat document as LibreOffice writes one, with what the model does not hold around a sheet's cells.
export function odfFlatWithKept(cells = ''): string {
  const ns = Object.entries({ ...ODF_NS, config: CONFIG })
    .map(([p, uri]) => `xmlns:${p}="${uri}"`)
    .join(' ');
  return (
    `<?xml version="1.0"?><office:document ${ns} office:version="1.4" ` +
    `office:mimetype="application/vnd.oasis.opendocument.spreadsheet">${SETTINGS}${SCRIPTS}` +
    `<office:automatic-styles>${GRAPHIC}${PARAGRAPH}${CELL_STYLE}</office:automatic-styles>` +
    `<office:body><office:spreadsheet>${TRACKED}<table:calculation-settings/>${VALIDATIONS}` +
    `<table:table table:name="Sheet1" table:style-name="ta1" table:protected="true">${SHAPES}` +
    '<table:table-column table:number-columns-repeated="3"/><text:soft-page-break/>' +
    `<table:table-row><table:table-cell table:number-columns-spanned="2" table:content-validation-name="val1" office:value-type="float" office:value="1">${NOTE}<text:p>1</text:p><draw:frame draw:name="after"/></table:table-cell>` +
    `<table:covered-table-cell/><table:table-cell calcext:value-type="float" office:value-type="float" office:value="2"><text:p>2</text:p></table:table-cell></table:table-row>` +
    `${cells}${FORMATS}</table:table>${NAMES}</office:spreadsheet></office:body></office:document>`
  );
}

export const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
export const XR = 'http://schemas.microsoft.com/office/spreadsheetml/2014/revision';
export const X14AC = 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac';

export const REVISION = '<xr:revisionPtr revIDLastSave="0" documentId="13_ncr"/>';
export const BOOK_VIEWS = '<bookViews><workbookView activeTab="2" firstSheet="1"/></bookViews>';
export const GLOBAL_NAME = '<definedName name="Total">Data!$A$1</definedName>';
export const LOCAL_NAME = '<definedName name="Mine" localSheetId="2">Data!$B$1</definedName>';
export const CHART_NAME = '<definedName name="Lost" localSheetId="1">Data!$C$1</definedName>';
export const CALC = '<calcPr calcId="191029"/>';
export const PIVOTS = '<pivotCaches><pivotCache cacheId="1" r:id="rId9"/></pivotCaches>';
export const SHEET_VIEWS =
  '<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>';
export const MERGES = '<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>';
export const LINKS = '<hyperlinks><hyperlink ref="A2" r:id="rId3"/></hyperlinks>';
export const MARGINS =
  '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>';
export const DRAWING = '<drawing r:id="rId1"/>';
export const CONTROLS = '<controls><control shapeId="1" r:id="rId8"/></controls>';
export const RULES =
  '<conditionalFormatting sqref="A1"><cfRule type="top10" dxfId="0" priority="1" rank="10"/></conditionalFormatting>' +
  '<conditionalFormatting sqref="A2"><cfRule type="duplicateValues" dxfId="0" priority="2"/></conditionalFormatting>';
export const DXFS = '<dxfs count="1"><dxf><font><b/></font></dxf></dxfs>';

export const workbook = (sheets: string, more = '') =>
  `<?xml version="1.0"?><workbook xmlns="${SPREADSHEETML_NS}" xmlns:r="${R}" xmlns:mc="${MC}" xmlns:xr="${XR}" ` +
  `mc:Ignorable="xr x99">${REVISION}<workbookPr/>${BOOK_VIEWS}<sheets>${sheets}</sheets>` +
  `<definedNames>${GLOBAL_NAME}${CHART_NAME}${LOCAL_NAME}</definedNames>${CALC}${PIVOTS}${more}</workbook>`;

export const worksheet = (cells: string, more = '') =>
  `<?xml version="1.0"?><worksheet xmlns="${SPREADSHEETML_NS}" xmlns:r="${R}" xmlns:mc="${MC}" xmlns:x14ac="${X14AC}" ` +
  `mc:Ignorable="x14ac xr" xr:uid="{00}" xmlns:xr="${XR}"><dimension ref="A1"/>${SHEET_VIEWS}<cols><col min="1" max="2" width="20" style="3" customWidth="1"/></cols>` +
  `<sheetData>${cells}</sheetData>${MERGES}${LINKS}${MARGINS}${DRAWING}${more}</worksheet>`;

export function excelFileWithKept(): Uint8Array<ArrayBuffer> {
  const xml = (name: string, contentType: string, text: string): OoxmlPart => ({
    name,
    contentType,
    data: encode(text),
  });
  const parts: OoxmlPart[] = [
    xml(
      'xl/workbook.xml',
      OOXML_CONTENT_TYPES.spreadsheet,
      workbook(
        '<sheet name="Data" sheetId="1" r:id="rId1"/><sheet name="Chart" sheetId="2" r:id="rId2"/>' +
          '<sheet name="Hidden" sheetId="3" state="hidden" xr:uid="{01}" r:id="rId3"/>',
      ),
    ),
    xml(
      'xl/worksheets/sheet1.xml',
      OOXML_CONTENT_TYPES.worksheet,
      worksheet('<row r="1"><c r="A1"><v>1</v></c></row>', CONTROLS + RULES),
    ),
    xml(
      'xl/chartsheets/sheet1.xml',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml',
      '<chartsheet/>',
    ),
    xml('xl/worksheets/sheet2.xml', OOXML_CONTENT_TYPES.worksheet, worksheet('')),
    xml(
      'xl/styles.xml',
      OOXML_CONTENT_TYPES.spreadsheetStyles,
      `<styleSheet xmlns="${SPREADSHEETML_NS}">${DXFS}<tableStyles count="0"/></styleSheet>`,
    ),
    xml(
      'xl/calcChain.xml',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml',
      '<calcChain/>',
    ),
    xml(
      'xl/theme/theme1.xml',
      'application/vnd.openxmlformats-officedocument.theme+xml',
      '<a:theme/>',
    ),
    xml(
      'xl/pivotCache/pivotCacheDefinition1.xml',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml',
      '<pivotCacheDefinition/>',
    ),
    xml(
      'xl/drawings/drawing1.xml',
      'application/vnd.openxmlformats-officedocument.drawing+xml',
      '<xdr:wsDr/>',
    ),
    { name: 'xl/media/image1.png', contentType: 'image/png', data: new Uint8Array([137, 80]) },
    {
      name: 'xl/vbaProject.bin',
      contentType: 'application/vnd.ms-office.vbaProject',
      data: new Uint8Array([1]),
    },
    xml(
      'xl/drawings/drawing2.xml',
      'application/vnd.openxmlformats-officedocument.drawing+xml',
      '<xdr:wsDr/>',
    ),
    xml(
      'docProps/custom.xml',
      'application/vnd.openxmlformats-officedocument.custom-properties+xml',
      '<Properties/>',
    ),
  ];
  const rel = (id: string, type: string, target: string, external = false): Relationship => ({
    id,
    type,
    target,
    ...(external ? { external } : {}),
  });
  const relationships = new Map<string, Relationship[]>([
    [
      '',
      [
        rel('rId1', RELATIONSHIP_TYPES.officeDocument, 'xl/workbook.xml'),
        rel('rId4', `${R}/custom-properties`, 'docProps/custom.xml'),
      ],
    ],
    [
      'xl/workbook.xml',
      [
        rel('rId1', RELATIONSHIP_TYPES.worksheet, 'worksheets/sheet1.xml'),
        rel('rId2', `${R}/chartsheet`, 'chartsheets/sheet1.xml'),
        rel('rId3', RELATIONSHIP_TYPES.worksheet, 'worksheets/sheet2.xml'),
        rel('rId5', RELATIONSHIP_TYPES.styles, 'styles.xml'),
        rel('rId6', `${R}/calcChain`, 'calcChain.xml'),
        rel('rId7', RELATIONSHIP_TYPES.theme, 'theme/theme1.xml'),
        rel('rId9', `${R}/pivotCacheDefinition`, 'pivotCache/pivotCacheDefinition1.xml'),
        rel('rId10', RELATIONSHIP_TYPES.vbaProject, 'vbaProject.bin'),
      ],
    ],
    [
      'xl/worksheets/sheet1.xml',
      [
        rel('rId1', `${R}/drawing`, '../drawings/drawing1.xml'),
        rel('rId3', RELATIONSHIP_TYPES.hyperlink, 'https://example.com/', true),
      ],
    ],
    ['xl/worksheets/sheet2.xml', [rel('rId1', `${R}/drawing`, '../drawings/drawing2.xml')]],
    [
      'xl/drawings/drawing1.xml',
      [
        rel('rId1', RELATIONSHIP_TYPES.image, '../media/image1.png'),
        rel('rId2', RELATIONSHIP_TYPES.hyperlink, 'https://example.com/a', true),
      ],
    ],
    // The second drawing shares the first's picture, names one not there, and links back to a worksheet.
    [
      'xl/drawings/drawing2.xml',
      [
        rel('rId1', RELATIONSHIP_TYPES.image, '../media/image1.png'),
        rel('rId2', RELATIONSHIP_TYPES.image, '../media/missing.png'),
        rel('rId3', RELATIONSHIP_TYPES.worksheet, '../worksheets/sheet1.xml'),
      ],
    ],
  ]);
  return writeOoxmlPackage(parts, relationships);
}
