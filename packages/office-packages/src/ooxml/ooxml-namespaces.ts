// The OOXML namespaces, relationship types and content types the container names (ISO/IEC 29500 parts 1 and 2),
// resolved by URI. Strict's relationship types are read as Transitional's.
export const OPC_NS = {
  contentTypes: 'http://schemas.openxmlformats.org/package/2006/content-types',
  relationships: 'http://schemas.openxmlformats.org/package/2006/relationships',
  coreProperties: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
} as const;

const TRANSITIONAL_RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const STRICT_RELS = 'http://purl.oclc.org/ooxml/officeDocument/relationships';

export const RELATIONSHIP_TYPES = {
  officeDocument: `${TRANSITIONAL_RELS}/officeDocument`,
  styles: `${TRANSITIONAL_RELS}/styles`,
  numbering: `${TRANSITIONAL_RELS}/numbering`,
  settings: `${TRANSITIONAL_RELS}/settings`,
  fontTable: `${TRANSITIONAL_RELS}/fontTable`,
  theme: `${TRANSITIONAL_RELS}/theme`,
  hyperlink: `${TRANSITIONAL_RELS}/hyperlink`,
  header: `${TRANSITIONAL_RELS}/header`,
  footer: `${TRANSITIONAL_RELS}/footer`,
  footnotes: `${TRANSITIONAL_RELS}/footnotes`,
  comments: `${TRANSITIONAL_RELS}/comments`,
  commentsExtended: 'http://schemas.microsoft.com/office/2011/relationships/commentsExtended',
  commentsIds: 'http://schemas.microsoft.com/office/2016/09/relationships/commentsIds',
  commentsExtensible:
    'http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible',
  image: `${TRANSITIONAL_RELS}/image`,
  oleObject: `${TRANSITIONAL_RELS}/oleObject`,
  package: `${TRANSITIONAL_RELS}/package`,
  control: `${TRANSITIONAL_RELS}/control`,
  extendedProperties: `${TRANSITIONAL_RELS}/extended-properties`,
  coreProperties:
    'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  thumbnail: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail',
  signatureOrigin:
    'http://schemas.openxmlformats.org/package/2006/relationships/digital-signature/origin',
  vbaProject: 'http://schemas.microsoft.com/office/2006/relationships/vbaProject',
  worksheet: `${TRANSITIONAL_RELS}/worksheet`,
  sharedStrings: `${TRANSITIONAL_RELS}/sharedStrings`,
  sheetMetadata: `${TRANSITIONAL_RELS}/sheetMetadata`,
  drawing: `${TRANSITIONAL_RELS}/drawing`,
  chart: `${TRANSITIONAL_RELS}/chart`,
  pivotTable: `${TRANSITIONAL_RELS}/pivotTable`,
  pivotCacheDefinition: `${TRANSITIONAL_RELS}/pivotCacheDefinition`,
} as const;

/** A relationship type with Strict's namespace read as Transitional's. */
export const transitionalType = (type: string): string =>
  type.startsWith(STRICT_RELS) ? TRANSITIONAL_RELS + type.slice(STRICT_RELS.length) : type;

export const OOXML_CONTENT_TYPES = {
  relationships: 'application/vnd.openxmlformats-package.relationships+xml',
  xml: 'application/xml',
  document: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
  template: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml',
  macroDocument: 'application/vnd.ms-word.document.macroEnabled.main+xml',
  macroTemplate: 'application/vnd.ms-word.template.macroEnabledTemplate.main+xml',
  styles: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
  numbering: 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml',
  settings: 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml',
  header: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml',
  footer: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml',
  footnotes: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml',
  comments: 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml',
  commentsExtended:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml',
  coreProperties: 'application/vnd.openxmlformats-package.core-properties+xml',
  extendedProperties: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
  spreadsheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  spreadsheetTemplate:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml',
  macroSpreadsheet: 'application/vnd.ms-excel.sheet.macroEnabled.main+xml',
  worksheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
  sharedStrings: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml',
  spreadsheetStyles: 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml',
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
  sheetMetadata: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml',
  drawing: 'application/vnd.openxmlformats-officedocument.drawing+xml',
  chart: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
  pivotTable: 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml',
  pivotCacheDefinition:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml',
} as const;
