// A text document's modes (docs/specs/034-text-documents/review.md "Editing modes"): Editing, Suggesting and Viewing,
// in Google's order and words, on the office shell's mode switch (office-shell.md "Modes").
import { lucideEye, lucidePencil, lucidePencilLine } from '@livedoc/icons/lucide';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { OfficeModeInfo } from '@/lib/office/office-mode';

export type TextDocumentMode = 'editing' | 'suggesting' | 'viewing';

// What a Participant runs in Suggesting above their level (review.md "While suggesting", "A Participant"): the changes
// a suggestion can carry, made in the writing and rewritten as suggestions. Lists and paragraph styles keep their
// definitions beside the writing, so they stay an Editor's; text-document-proposals.test.ts guards the list.
export const SUGGESTING_PROPOSALS: readonly string[] = [
  // Edit
  'undo',
  'redo',
  'cut',
  'paste',
  'paste-without-formatting',
  'delete',
  // Insert: what goes in the writing, objects in a line and breaks (review.md "Objects in a line", "Breaks and lines")
  'image-upload',
  'image-search',
  'image-gallery',
  'link',
  'special-characters',
  'emoji',
  'equation',
  'show-equation-toolbar',
  'horizontal-line',
  'page-break',
  'column-break',
  'bookmark',
  // Headers, footers and notes written in as suggestions (review.md "Headers, footers and notes")
  'footnote',
  'header',
  'footer',
  // Insert: whole blocks (review.md "Whole blocks")
  'table-grid',
  'section-break-next-page',
  'section-break-continuous',
  'toc-plain',
  'toc-dotted',
  'toc-links',
  // Table: one's own suggested table changed plainly; anyone else's says it can't be suggested yet
  'table-insert-row-above',
  'table-insert-row-below',
  'table-insert-column-left',
  'table-insert-column-right',
  'table-delete-row',
  'table-delete-column',
  'table-delete',
  'table-move-row-up',
  'table-move-row-down',
  'table-move-column-left',
  'table-move-column-right',
  'table-distribute-rows',
  'table-distribute-columns',
  'table-merge-cells',
  'table-unmerge-cells',
  'table-sort-ascending',
  'table-sort-descending',
  'table-pin-none',
  'table-pin-current',
  // Format > Text, Clear formatting and the paint roller
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'superscript',
  'subscript',
  'small-caps',
  'size-increase',
  'size-decrease',
  'lowercase',
  'uppercase',
  'title-case',
  'clear-formatting',
  'paint-format',
  // Format > Align & indent, Line & paragraph spacing, Borders and shading; the toolbar's Align and spacing
  'align-left',
  'align-centre',
  'align-right',
  'align-justified',
  'indent-increase',
  'indent-decrease',
  'indentation-options',
  'spacing-single',
  'spacing-115',
  'spacing-15',
  'spacing-double',
  'space-before',
  'space-after',
  'custom-spacing',
  'keep-with-next',
  'keep-lines-together',
  'prevent-single-lines',
  'add-page-break-before',
  'borders-and-shading',
  'align',
  'line-spacing',
];

// What writes beside the writing and cannot be suggested yet (review.md "While suggesting", "Not yet"): dimmed while
// suggesting, for an Editor too, saying where it runs.
export const NOT_YET_SUGGESTED: readonly string[] = ['drawing-new'];
export const NOT_YET_SUGGESTED_NOTE = 'Editing only';
export const NOT_YET_SUGGESTED_HINT =
  "This can't be suggested yet. An Editor changes it in Editing.";

/** The not-yet items bound dimmed, with their note and hint, for the menus while suggesting. */
export const notYetSuggestedActions = (): OfficeActions =>
  Object.fromEntries(
    NOT_YET_SUGGESTED.map((id) => [
      id,
      { run: () => {}, disabled: true, note: NOT_YET_SUGGESTED_NOTE, hint: NOT_YET_SUGGESTED_HINT },
    ]),
  );

export const TEXT_DOCUMENT_MODES: readonly OfficeModeInfo<TextDocumentMode>[] = [
  {
    mode: 'editing',
    label: 'Editing',
    description: 'Edit document directly',
    icon: lucidePencil,
    level: 'edit',
    drawnAt: 'edit',
    status: 'built',
    item: 'mode-editing',
  },
  {
    mode: 'suggesting',
    label: 'Suggesting',
    description: 'Edits become suggestions',
    icon: lucidePencilLine,
    level: 'participate',
    drawnAt: 'edit',
    status: 'built',
    item: 'mode-suggesting',
    // A Participant's suggestions are proposals the room judges: drawn as an Editor's, only these run above them.
    proposes: SUGGESTING_PROPOSALS,
  },
  {
    mode: 'viewing',
    label: 'Viewing',
    description: 'Read or print final document',
    icon: lucideEye,
    level: 'view',
    drawnAt: 'view',
    status: 'built',
    item: 'mode-viewing',
  },
];
