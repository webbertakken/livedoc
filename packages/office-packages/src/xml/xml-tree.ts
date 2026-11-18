// One XML parser for every office file (docs/specs/020-import-export/office-packages.md "Reading a package" step 6):
// saxes, streaming and non-validating, building a small DOM-free tree so the editor, the api, the MCP server and the
// CLI read the same way. Entities are never resolved: any DOCTYPE is refused before a byte of its body is read.
// Namespaces are resolved by URI, never by prefix.
import { SaxesParser, type SaxesAttributeNS } from 'saxes';
import { refuse, type PackageRefusal } from '../rejections';

export type XmlAttribute = { uri: string; local: string; value: string };

export type XmlElement = {
  uri: string;
  local: string;
  attributes: readonly XmlAttribute[];
  children: readonly XmlNode[];
};

export type XmlNode = XmlElement | string;

export type XmlParse = { ok: true; root: XmlElement } | PackageRefusal;

type MutableElement = {
  uri: string;
  local: string;
  attributes: XmlAttribute[];
  children: XmlNode[];
};

class DoctypeRefused extends Error {}

/** The entry's XML as a tree, or `xml_doctype_refused` / `xml_malformed` with the entry and line. */
export function parseXml(text: string, entry?: string): XmlParse {
  const parser = new SaxesParser({ xmlns: true, position: true });
  const stack: MutableElement[] = [];
  let root: MutableElement | null = null;
  parser.on('doctype', () => {
    throw new DoctypeRefused();
  });
  parser.on('opentag', (tag) => {
    // With `xmlns` on, every name is resolved: a tag and its attributes carry their URI and local name.
    const attributes = Object.values(tag.attributes as Record<string, SaxesAttributeNS>);
    const element: MutableElement = {
      uri: tag.uri,
      local: tag.local,
      // Namespace declarations are the parser's business, not the document's.
      attributes: attributes
        .filter((a) => a.prefix !== 'xmlns' && a.name !== 'xmlns')
        .map((a) => ({ uri: a.uri, local: a.local, value: a.value })),
      children: [],
    };
    const parent = stack.at(-1);
    if (parent) parent.children.push(element);
    else root = element;
    stack.push(element);
  });
  parser.on('closetag', () => {
    stack.pop();
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
  return { ok: true, root };
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
