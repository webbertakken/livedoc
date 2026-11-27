// A cell's text in ODF (docs/specs/029-sheets/standard-mapping.md "Unknown content", D376): its paragraphs as lines,
// with spaces, tabs and line breaks spelled out; and whether a paragraph holds marked text (a link, a span: anything
// but those), which the reader keeps whole while the cell's text reads the same. Shared by the reader and the writer.
import {
  attributeOf,
  childElements,
  keptXmlWithin,
  ODF_NS,
  parseXml,
  type XmlBindings,
  type XmlElement,
  type XmlNode,
} from '@livedoc/office-packages';

const { office: OFFICE, text: TEXT } = ODF_NS;
// The marks a paragraph's plain text spells: they read as text, so a paragraph of only these is plain.
const SPELLED: ReadonlySet<string> = new Set(['s', 'tab', 'line-break']);

/** A paragraph's (or any node's) text: spaces, tabs and line breaks spelled out; a note's text is not the cell's. */
export function inlineText(node: XmlNode): string {
  if (typeof node === 'string') return node;
  if (node.uri === TEXT && node.local === 's') {
    const n = Number(attributeOf(node, TEXT, 'c') ?? '1');
    return ' '.repeat(Number.isInteger(n) && n > 0 ? Math.min(n, 1_000) : 1);
  }
  if (node.uri === TEXT && node.local === 'tab') return '\t';
  if (node.uri === TEXT && node.local === 'line-break') return '\n';
  // Annotations hold a comment's text, not the cell's.
  if (node.uri === OFFICE && node.local === 'annotation') return '';
  return node.children.map(inlineText).join('');
}

/** A cell's paragraphs. */
export const cellParagraphs = (cell: XmlElement): XmlElement[] =>
  childElements(cell).filter((c) => c.uri === TEXT && c.local === 'p');

/** A cell's text: its paragraphs as lines. */
export const cellText = (cell: XmlElement): string =>
  cellParagraphs(cell).map(inlineText).join('\n');

/** Whether a paragraph holds marked text: an element below it other than a space, a tab or a line break. */
export function isMarkedParagraph(paragraph: XmlElement): boolean {
  return childElements(paragraph).some(
    (child) => !(child.uri === TEXT && SPELLED.has(child.local)) || isMarkedParagraph(child),
  );
}

/** The text kept paragraphs read as, as the cell's would; null when one does not parse. */
export function keptParagraphsText(items: readonly { xml: string; ns: XmlBindings }[]): string | null {
  const lines: string[] = [];
  for (const item of items) {
    const parsed = parseXml(keptXmlWithin(item, {}));
    if (!parsed.ok) return null;
    lines.push(inlineText(parsed.root));
  }
  return lines.join('\n');
}
