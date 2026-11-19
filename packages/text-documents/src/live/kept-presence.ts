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
