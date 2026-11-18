// A text document as ODF 1.4 (docs/specs/034-text-documents/standard-mapping.md): the body's paragraphs as
// `text:p` in `office:text`, written into an ODF package and read back from one, or from a flat file.
import {
  attributeOf,
  childElement,
  escapeXmlAttribute,
  escapeXmlText,
  looksLikeXml,
  ODF_MEDIA_TYPES,
  ODF_NS,
  ODF_VERSION,
  parseXml,
  readOdfPackage,
  refuse,
  writeOdfPackage,
  XML_DECLARATION,
  type PackageRefusal,
  type XmlElement,
  type XmlNode,
} from '@livedoc/office-packages';
import type { Body, Paragraph } from './body';

const NAMESPACES = (...prefixes: (keyof typeof ODF_NS)[]) =>
  prefixes.map((p) => `xmlns:${p}="${ODF_NS[p]}"`).join(' ');

/** The paragraph's characters as ODF text: runs of spaces as `text:s`, tabs and line breaks as elements. */
export function odfParagraphContent(text: string): string {
  let out = '';
  let at = 0;
  while (at < text.length) {
    const char = text[at]!;
    if (char === '\t') {
      out += '<text:tab/>';
      at += 1;
    } else if (char === '\n') {
      out += '<text:line-break/>';
      at += 1;
    } else if (char === ' ') {
      let end = at;
      while (text[end] === ' ') end += 1;
      const count = end - at;
      // A space survives ODF's white-space collapse only as the first of a run inside the text; one at the start or
      // end of the paragraph, or after the first, is written as `text:s`.
      const literal = at > 0 && end < text.length ? 1 : 0;
      out += literal ? ' ' : '';
      const kept = count - literal;
      if (kept === 1) out += '<text:s/>';
      else if (kept > 1) out += `<text:s text:c="${kept}"/>`;
      at = end;
    } else {
      let end = at;
      while (end < text.length && !'\t\n '.includes(text[end]!)) end += 1;
      out += escapeXmlText(text.slice(at, end));
      at = end;
    }
  }
  return out;
}

function contentXml(body: Body): string {
  const paragraphs = (body.length > 0 ? body : [{ text: '' }])
    .map((p) => `<text:p text:style-name="Standard">${odfParagraphContent(p.text)}</text:p>`)
    .join('');
  return `${XML_DECLARATION}\n<office:document-content ${NAMESPACES('office', 'style', 'text', 'fo')} office:version="${ODF_VERSION}"><office:body><office:text>${paragraphs}</office:text></office:body></office:document-content>\n`;
}

function stylesXml(): string {
  return `${XML_DECLARATION}\n<office:document-styles ${NAMESPACES('office', 'style', 'text', 'fo')} office:version="${ODF_VERSION}"><office:styles><style:style style:name="Standard" style:family="paragraph" style:class="text"/></office:styles></office:document-styles>\n`;
}

function metaXml(title: string): string {
  return `${XML_DECLARATION}\n<office:document-meta ${NAMESPACES('office', 'meta', 'dc')} office:version="${ODF_VERSION}"><office:meta><meta:generator>LiveDoc</meta:generator><dc:title>${escapeXmlText(title)}</dc:title></office:meta></office:document-meta>\n`;
}

function settingsXml(): string {
  return `${XML_DECLARATION}\n<office:document-settings ${NAMESPACES('office')} office:version="${ODF_VERSION}"/>\n`;
}

/** The text document as an `.odt` package: the same bytes for the same body and title. */
export function writeOdt(body: Body, title: string): Uint8Array<ArrayBuffer> {
  const xml = (text: string) => new TextEncoder().encode(text);
  return writeOdfPackage(ODF_MEDIA_TYPES.text, [
    { name: 'content.xml', mediaType: 'text/xml', data: xml(contentXml(body)) },
    { name: 'styles.xml', mediaType: 'text/xml', data: xml(stylesXml()) },
    { name: 'meta.xml', mediaType: 'text/xml', data: xml(metaXml(title)) },
    { name: 'settings.xml', mediaType: 'text/xml', data: xml(settingsXml()) },
  ]);
}

/** The text document as an ODF flat file (`.fodt`): one `office:document`. */
export function writeFodt(body: Body, title: string): Uint8Array {
  const paragraphs = (body.length > 0 ? body : [{ text: '' }])
    .map((p) => `<text:p text:style-name="Standard">${odfParagraphContent(p.text)}</text:p>`)
    .join('');
  const xml = `${XML_DECLARATION}\n<office:document ${NAMESPACES('office', 'style', 'text', 'fo', 'meta', 'dc')} office:version="${ODF_VERSION}" office:mimetype="${escapeXmlAttribute(ODF_MEDIA_TYPES.text)}"><office:meta><meta:generator>LiveDoc</meta:generator><dc:title>${escapeXmlText(title)}</dc:title></office:meta><office:styles><style:style style:name="Standard" style:family="paragraph" style:class="text"/></office:styles><office:body><office:text>${paragraphs}</office:text></office:body></office:document>\n`;
  return new TextEncoder().encode(xml);
}

const isElement = (node: XmlNode): node is XmlElement => typeof node !== 'string';
const isText = (element: XmlElement, local: string) =>
  element.uri === ODF_NS.text && element.local === local;

// Inline content whose words are not the paragraph's own: notes, tracked changes' records, ruby annotations.
const SKIPPED_INLINE = new Set(['note', 'tracked-changes', 'ruby-text']);

// ODF's white-space processing (ODF 1.4 part 3, "White-space characters"): runs of space, tab, CR and LF in the
// markup are one space, and none at a paragraph's start; `text:s`, `text:tab` and `text:line-break` are the
// characters themselves.
function paragraphText(paragraph: XmlElement): string {
  let out = '';
  let afterSpace = true;
  const walk = (node: XmlNode) => {
    if (!isElement(node)) {
      for (const char of node) {
        if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
          if (!afterSpace) out += ' ';
          afterSpace = true;
        } else {
          out += char;
          afterSpace = false;
        }
      }
      return;
    }
    if (node.uri === ODF_NS.office && node.local === 'annotation') return;
    if (node.uri === ODF_NS.office && node.local === 'annotation-end') return;
    if (node.uri === ODF_NS.draw) return;
    if (node.uri === ODF_NS.text) {
      if (SKIPPED_INLINE.has(node.local)) return;
      if (node.local === 's') {
        const count = Number(attributeOf(node, ODF_NS.text, 'c') ?? '1');
        out += ' '.repeat(Number.isInteger(count) && count > 0 ? count : 1);
        afterSpace = false;
        return;
      }
      if (node.local === 'tab') {
        out += '\t';
        afterSpace = false;
        return;
      }
      if (node.local === 'line-break') {
        out += '\n';
        afterSpace = false;
        return;
      }
    }
    node.children.forEach(walk);
  };
  paragraph.children.forEach(walk);
  return out;
}

// The paragraphs in reading order: through sections and lists; tables and frames wait for their phases.
function bodyParagraphs(container: XmlElement): Paragraph[] {
  return container.children.filter(isElement).flatMap((element): Paragraph[] => {
    if (isText(element, 'p') || isText(element, 'h')) return [{ text: paragraphText(element) }];
    if (
      isText(element, 'section') ||
      isText(element, 'list') ||
      isText(element, 'list-item') ||
      isText(element, 'list-header')
    )
      return bodyParagraphs(element);
    return [];
  });
}

function officeText(root: XmlElement): XmlElement | undefined {
  const body = childElement(root, ODF_NS.office, 'body');
  return body ? childElement(body, ODF_NS.office, 'text') : undefined;
}

export type OdfTextRead =
  { ok: true; body: Body; flat: boolean; dropped: readonly string[] } | PackageRefusal;

/** A text document's body from an `.odt` package or an `.fodt` flat file. */
export async function readOdfText(file: Uint8Array): Promise<OdfTextRead> {
  // The zip reader views the bytes through their own ArrayBuffer.
  const bytes = new Uint8Array(file);
  if (looksLikeXml(bytes)) {
    const parsed = parseXml(new TextDecoder().decode(bytes));
    if (!parsed.ok) return parsed;
    const root = parsed.root;
    if (root.uri !== ODF_NS.office || root.local !== 'document') return refuse('package_damaged');
    const mediaType = attributeOf(root, ODF_NS.office, 'mimetype');
    if (mediaType !== ODF_MEDIA_TYPES.text) return refuse('package_wrong_type');
    const text = officeText(root);
    if (!text) return refuse('package_damaged');
    return { ok: true, body: bodyParagraphs(text), flat: true, dropped: [] };
  }
  const read = await readOdfPackage(bytes);
  if (!read.ok) return read;
  const { mediaType, entries, dropped } = read.package;
  if (mediaType !== ODF_MEDIA_TYPES.text && mediaType !== ODF_MEDIA_TYPES.textTemplate)
    return refuse('package_wrong_type');
  const content = entries.get('content.xml');
  if (!content) return refuse('package_damaged', { entry: 'content.xml' });
  const parsed = parseXml(new TextDecoder().decode(content), 'content.xml');
  if (!parsed.ok) return parsed;
  const text = officeText(parsed.root);
  if (!text) return refuse('package_damaged', { entry: 'content.xml' });
  return { ok: true, body: bodyParagraphs(text), flat: false, dropped };
}
