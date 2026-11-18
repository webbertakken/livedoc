// Kept XML (docs/specs/034-text-documents/standard-mapping.md "Kept content"): what a file holds that the model does
// not, kept as the file's own text with the namespace bindings it needs, and written back where it stood.
import { escapeXmlAttribute, escapeXmlText } from './xml-write';
import type { XmlBindings, XmlElement, XmlParsed } from './xml-tree';

/** An element as the file wrote it, and the bindings of the prefixes it uses that are declared above it. */
export type KeptXml = { readonly xml: string; readonly ns: XmlBindings };

// The prefixes the element and its descendants use that no declaration inside the kept text binds.
function prefixesUsed(
  element: XmlElement,
  into: Set<string>,
  shadowed: ReadonlySet<string>,
): Set<string> {
  const inner = new Set([...shadowed, ...Object.keys(element.declared)]);
  const use = (prefix: string) => {
    if (!inner.has(prefix)) into.add(prefix);
  };
  use(element.prefix);
  for (const a of element.attributes) if (a.prefix) use(a.prefix);
  for (const child of element.children)
    if (typeof child !== 'string') prefixesUsed(child, into, inner);
  return into;
}

/** The element kept: its exact source text and the outer bindings it needs. */
export function keptXmlOf(parsed: XmlParsed, element: XmlElement): KeptXml {
  const ns: Record<string, string> = {};
  for (const prefix of prefixesUsed(element, new Set(), new Set())) {
    const uri = element.scope[prefix];
    if (uri && prefix !== 'xml') ns[prefix] = uri;
  }
  return { xml: parsed.source.slice(element.start, element.end), ns };
}

const declaration = (prefix: string, uri: string) =>
  `${prefix ? `xmlns:${prefix}` : 'xmlns'}="${escapeXmlAttribute(uri)}"`;

/**
 * The kept XML to write inside a root binding `rootNs`: as is, or with the bindings the root lacks (or binds to
 * another namespace) declared on the kept element itself.
 */
export function keptXmlWithin(kept: KeptXml, rootNs: XmlBindings): string {
  const missing = Object.entries(kept.ns).filter(([prefix, uri]) => rootNs[prefix] !== uri);
  if (missing.length === 0) return kept.xml;
  const nameEnd = kept.xml.search(/[\s/>]/);
  const declarations = missing.map(([prefix, uri]) => ` ${declaration(prefix, uri)}`).join('');
  return kept.xml.slice(0, nameEnd) + declarations + kept.xml.slice(nameEnd);
}

const qualified = (prefix: string, local: string) => (prefix ? `${prefix}:${local}` : local);

/** The element written from its tree, its own declarations included, leaving out the descendants `omit` names. */
export function serializeXml(
  element: XmlElement,
  omit: (e: XmlElement) => boolean = () => false,
): string {
  const name = qualified(element.prefix, element.local);
  const declarations = Object.entries(element.declared).map(
    ([p, uri]) => ` ${declaration(p, uri)}`,
  );
  const attributes = element.attributes.map(
    (a) => ` ${qualified(a.prefix, a.local)}="${escapeXmlAttribute(a.value)}"`,
  );
  const children = element.children
    .map((c) => (typeof c === 'string' ? escapeXmlText(c) : omit(c) ? '' : serializeXml(c, omit)))
    .join('');
  const open = `<${name}${declarations.join('')}${attributes.join('')}`;
  return children ? `${open}>${children}</${name}>` : `${open}/>`;
}
