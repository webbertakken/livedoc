// One XML parser for every office file (docs/specs/020-import-export/office-packages.md "Reading a package" step 6):
// saxes, streaming and non-validating, building a small DOM-free tree so the editor, the api, the MCP server and the
// CLI read the same way. Entities are never resolved: any DOCTYPE is refused before a byte of its body is read.
// Namespaces are resolved by URI, never by prefix; the prefixes, declarations and source offsets are recorded too, so
// content kept from a file is written back as the file wrote it (kept-xml.ts).
import { SaxesParser, type SaxesAttributeNS } from 'saxes';
import { refuse, type PackageRefusal } from '../rejections';

export type XmlAttribute = { uri: string; local: string; prefix: string; value: string };

/** Prefix to namespace URI; the empty prefix is the default namespace. */
export type XmlBindings = Readonly<Record<string, string>>;

export type XmlElement = {
  uri: string;
  local: string;
  prefix: string;
  attributes: readonly XmlAttribute[];
  children: readonly XmlNode[];
  /** The namespaces this element declares itself. */
  declared: XmlBindings;
  /** Every namespace in scope here, its own declarations included. */
  scope: XmlBindings;
  /** Where the element starts and ends in the source text, in UTF-16 code units. */
  start: number;
  end: number;
};

export type XmlNode = XmlElement | string;

/** A parsed entry: its root, and the text it was parsed from (for kept XML). */
export type XmlParsed = { ok: true; root: XmlElement; source: string };

export type XmlParse = XmlParsed | PackageRefusal;

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? U[] : T[K] };
type MutableElement = Mutable<XmlElement>;

class DoctypeRefused extends Error {}

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/** The entry's XML as a tree, or `xml_doctype_refused` / `xml_malformed` with the entry and line. */
export function parseXml(text: string, entry?: string): XmlParse {
  const parser = new SaxesParser({ xmlns: true, position: true });
  const stack: MutableElement[] = [];
  let root: MutableElement | null = null;
  let tagStart = 0;
  parser.on('doctype', () => {
    throw new DoctypeRefused();
  });
  parser.on('opentagstart', () => {
    // The parser has read past the name: the tag starts at the last `<` before here.
    tagStart = text.lastIndexOf('<', parser.position - 1);
  });
  parser.on('opentag', (tag) => {
    // With `xmlns` on, every name is resolved: a tag and its attributes carry their URI and local name.
    const attributes = Object.values(tag.attributes as Record<string, SaxesAttributeNS>);
    const parent = stack.at(-1);
    const declared: Record<string, string> = { ...tag.ns };
    const inherited = parent?.scope ?? { xml: XML_NS };
    const element: MutableElement = {
      uri: tag.uri,
      local: tag.local,
      prefix: tag.prefix,
      // Namespace declarations are the parser's business, not the document's.
      attributes: attributes
        .filter((a) => a.prefix !== 'xmlns' && a.name !== 'xmlns')
        .map((a) => ({ uri: a.uri, local: a.local, prefix: a.prefix, value: a.value })),
      children: [],
      declared,
      scope: Object.keys(declared).length > 0 ? { ...inherited, ...declared } : inherited,
      start: tagStart,
      end: parser.position,
    };
    if (parent) parent.children.push(element);
    else root = element;
    stack.push(element);
  });
  parser.on('closetag', () => {
    const element = stack.pop();
    if (element) element.end = parser.position;
  });
  const onText = (value: string) => {
    const parent = stack.at(-1);
    if (!parent) return;
    const last = parent.children.at(-1);
    if (typeof last === 'string') parent.children[parent.children.length - 1] = last + value;
    else parent.children.push(value);
  };
  parser.on('text', onText);
  parser.on('cdata', onText);
  try {
    parser.write(text).close();
  } catch (error) {
    const where = { ...(entry ? { entry } : {}), line: parser.line };
    if (error instanceof DoctypeRefused) return refuse('xml_doctype_refused', where);
    return refuse('xml_malformed', where);
  }
  if (!root) return refuse('xml_malformed', { ...(entry ? { entry } : {}), line: parser.line });
  return { ok: true, root, source: text };
}

/** The attribute's value by namespace URI and local name, or undefined. */
export function attributeOf(element: XmlElement, uri: string, local: string): string | undefined {
  return element.attributes.find((a) => a.uri === uri && a.local === local)?.value;
}

/** The element's child elements, in order. */
export function childElements(element: XmlElement): XmlElement[] {
  return element.children.filter((c): c is XmlElement => typeof c !== 'string');
}

/** The first child element with this namespace URI and local name. */
export function childElement(
  element: XmlElement,
  uri: string,
  local: string,
): XmlElement | undefined {
  return childElements(element).find((c) => c.uri === uri && c.local === local);
}

/** Whether the element has this namespace URI and local name. */
export const isElementNamed = (node: XmlNode, uri: string, local: string): node is XmlElement =>
  typeof node !== 'string' && node.uri === uri && node.local === local;

/** The element's text, its descendants' included, as the file holds it. */
export function textContent(element: XmlElement): string {
  return element.children.map((c) => (typeof c === 'string' ? c : textContent(c))).join('');
}
