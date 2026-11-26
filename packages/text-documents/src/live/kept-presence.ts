import { keptXmlWithin, parseXml, type KeptXml, type XmlElement } from '@livedoc/office-packages';

// How a kept construct shows on the page (docs/specs/034-text-documents/standard-mapping.md "Kept content", "Shown as
// it reads"), by its element's local name in either format: nothing for what has nothing to see, a line break for a
// break, the grey placeholder for the rest. It is kept and written back whichever it is.
export type KeptPresence = 'hidden' | 'break' | 'placeholder';

const HIDDEN = new Set([
  // ODF declarations and markers.
  'sequence-decls',
  'variable-decls',
  'user-field-decls',
  'dde-connection-decls',
  'forms',
  'bookmark',
  'bookmark-start',
  'bookmark-end',
  'reference-mark',
  'reference-mark-start',
  'reference-mark-end',
  'soft-page-break',
  'annotation-end',
  // Tracked changes a document read before they were suggestions kept (review.md "In the files").
  'tracked-changes',
  'change-start',
  'change-end',
  'change',
  // OOXML markers.
  'bookmarkStart',
  'bookmarkEnd',
  'commentRangeStart',
  'commentRangeEnd',
  'proofErr',
  'permStart',
  'permEnd',
  'lastRenderedPageBreak',
]);

const BREAKS = new Set(['br', 'line-break', 'cr']);

export function keptPresenceOf(name: string): KeptPresence {
  if (HIDDEN.has(name)) return 'hidden';
  if (BREAKS.has(name)) return 'break';
  return 'placeholder';
}

// A `br` element's type attribute, under any prefix.
const BREAK_TYPE = /<(?:[\w.-]+:)?br\b[^>]*?\s(?:[\w.-]+:)?type="(page|column)"/;

/**
 * A kept Word break's kind (docs/specs/034-text-documents/page-layout.md "Breaks"): `page` or `column` for a `w:br` of
 * that type, kept with its run as the file has it; null for anything else.
 */
export function keptBreakOf(name: string, xml: string): 'page' | 'column' | null {
  if (name !== 'br') return null;
  const type = BREAK_TYPE.exec(xml)?.[1];
  return type === 'page' || type === 'column' ? type : null;
}

const elements = (node: XmlElement) =>
  node.children.filter((c): c is XmlElement => typeof c !== 'string');

// A Word control's runs' text in reading order: each `w:t`'s characters, a `w:tab` as a tab.
function wordText(node: XmlElement): string {
  if (node.local === 't') return node.children.filter((c) => typeof c === 'string').join('');
  if (node.local === 'tab') return '\t';
  return elements(node).map(wordText).join('');
}

// A LibreOffice control's text: every character in it, its list items (the choices) left out.
function odfText(node: XmlElement): string {
  return node.children
    .map((c) => (typeof c === 'string' ? c : c.local === 'list-item' ? '' : odfText(c)))
    .join('');
}

/**
 * The text a kept content control inside a paragraph shows (docs/specs/034-text-documents/standard-mapping.md "Shown
 * as it reads"): a Word `w:sdt`'s runs' text in its content, or a LibreOffice `loext:content-control`'s text,
 * its list items left out; null for anything else, a control showing no text, or XML that does not parse.
 */
export function keptShownText(name: string, kept: KeptXml): string | null {
  if (name !== 'sdt' && name !== 'content-control') return null;
  const parsed = parseXml(keptXmlWithin(kept, {}));
  if (!parsed.ok) return null;
  const root = parsed.root;
  const text =
    name === 'sdt'
      ? elements(root)
          .filter((e) => e.local === 'sdtContent')
          .map(wordText)
          .join('')
      : odfText(root);
  return text === '' ? null : text;
}
