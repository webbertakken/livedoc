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

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};
const unescape = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name]!);

/**
 * The text a kept content control inside a paragraph shows (docs/specs/034-text-documents/standard-mapping.md "Shown
 * as it reads"): a Word `w:sdt`'s runs' text in its content, or a LibreOffice `loext:content-control`'s text,
 * its list items left out; null for anything else, or a control showing no text. Reads the kept element's own
 * serialised XML.
 */
export function keptShownText(name: string, xml: string): string | null {
  let text: string;
  if (name === 'sdt') {
    const content =
      /<(?:[\w.-]+:)?sdtContent\b[^>]*>([\s\S]*)<\/(?:[\w.-]+:)?sdtContent>/.exec(xml)?.[1] ?? '';
    text = [
      ...content.matchAll(/<(?:[\w.-]+:)?(t|tab)\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?t>)/g),
    ]
      .map(([, element, inner]) => (element === 'tab' ? '\t' : (inner ?? '')))
      .join('');
  } else if (name === 'content-control') {
    text = xml.replace(/<(?:[\w.-]+:)?list-item\b[^>]*\/>/g, '').replace(/<[^>]*>/g, '');
  } else return null;
  const shown = unescape(text);
  return shown === '' ? null : shown;
}
