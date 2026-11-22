// The ODF 1.4 namespaces the readers and writers name (OASIS ODF 1.4 part 3, "Namespaces"), resolved by URI.
export const ODF_NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  // Data styles: how a cell's number is drawn (number formats).
  number: 'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  dc: 'http://purl.org/dc/elements/1.1/',
  meta: 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  manifest: 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0',
  // OpenFormula (ODF 1.4 part 4): a spreadsheet's `table:formula` names it by its prefix, so a file declares it.
  of: 'urn:oasis:names:tc:opendocument:xmlns:of:1.2',
  // LibreOffice's extension: `calcext:value-type="error"` marks a formula's cached error, read, never written.
  calcext: 'urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0',
  // LibreOffice's office extension: `loext:decorative` marks a picture decorative (a text document's objects).
  loext: 'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0',
} as const;

/** The ODF version every file LiveDoc writes declares. */
export const ODF_VERSION = '1.4';

/** Media types of the ODF documents LiveDoc reads and writes. */
export const ODF_MEDIA_TYPES = {
  text: 'application/vnd.oasis.opendocument.text',
  textTemplate: 'application/vnd.oasis.opendocument.text-template',
  spreadsheet: 'application/vnd.oasis.opendocument.spreadsheet',
} as const;
