// Minimal office files for tests, built by hand so each abuse case is one line of difference. Test-only.
import { OOXML_CONTENT_TYPES, RELATIONSHIP_TYPES } from '@livedoc/office-packages';
import { writeTestZip } from '@livedoc/office-packages/testing';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const RELS = (rels: string) =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;

export type Entry = { name: string; data: string | Uint8Array };

/** A `.docx` whose body is `body`, with the main part's extra relationships and entries. */
export function docx(
  body: string,
  {
    rels = '',
    entries = [],
    mainType = OOXML_CONTENT_TYPES.document,
  }: { rels?: string; entries?: Entry[]; mainType?: string } = {},
): Uint8Array<ArrayBuffer> {
  return writeTestZip([
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="${OOXML_CONTENT_TYPES.relationships}"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="${mainType}"/></Types>`,
    },
    {
      name: '_rels/.rels',
      data: RELS(
        `<Relationship Id="rId1" Type="${RELATIONSHIP_TYPES.officeDocument}" Target="word/document.xml"/>`,
      ),
    },
    {
      name: 'word/document.xml',
      data: `<?xml version="1.0"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}</w:body></w:document>`,
    },
    ...(rels ? [{ name: 'word/_rels/document.xml.rels', data: RELS(rels) }] : []),
    ...entries,
  ]);
}

const ODF =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"';

/** An `.odt` whose `office:text` holds `body`, with extra entries. */
export function odt(
  body: string,
  {
    entries = [] as Entry[],
    mimetype = 'application/vnd.oasis.opendocument.text',
    content,
  }: { entries?: Entry[]; mimetype?: string; content?: string } = {},
): Uint8Array<ArrayBuffer> {
  return writeTestZip([
    { name: 'mimetype', data: mimetype },
    {
      name: 'content.xml',
      data:
        content ??
        `<?xml version="1.0"?><office:document-content ${ODF} office:version="1.4"><office:body><office:text>${body}</office:text></office:body></office:document-content>`,
    },
    ...entries,
  ]);
}

/** An `.fodt` whose `office:text` holds `body`. */
export const fodt = (body: string, mimetype = 'application/vnd.oasis.opendocument.text') =>
  new TextEncoder().encode(
    `<?xml version="1.0"?><office:document ${ODF} office:version="1.4" office:mimetype="${mimetype}"><office:body><office:text>${body}</office:text></office:body></office:document>`,
  );

export const W_P = (inner: string) => `<w:p>${inner}</w:p>`;
export const W_R = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
