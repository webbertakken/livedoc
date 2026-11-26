// The Explorer's New Document menu (docs/specs/013-workspace/new-document-menu.md "The blanks"): what a new document
// starts as, each a blank template and where its templates come from, which the menu lists in its pane. Pure data, in
// the menu's order; the number key of each is its place.
import type { TabOpening } from '@livedoc/document';
import type { TemplateKind } from './templates';

export const NEW_DOCUMENT_BLANK_IDS = [
  'diagram',
  'whiteboard',
  'brainstorm',
  'text-document',
  'spreadsheet',
  'pdf-document',
  'board',
  'form',
  'workshop',
] as const;

export type NewDocumentBlankId = (typeof NEW_DOCUMENT_BLANK_IDS)[number];

/**
 * Where a blank's templates come from: a template start's groups (all of them, or one), or one Plan family
 * (Board and Form templates are Plan templates, listed by their family).
 */
export type NewDocumentTemplateSource =
  { start: Exclude<TabOpening, 'plan'>; group?: string } | { plan: 'boards' | 'forms' };

/** The document kinds New Document makes, each a document of its own kind rather than a template. */
export const NEW_DOCUMENT_KINDS = ['text-document', 'spreadsheet', 'pdf-document'] as const;
export type NewDocumentKind = (typeof NEW_DOCUMENT_KINDS)[number];

export const isNewDocumentKind = (value: unknown): value is NewDocumentKind =>
  NEW_DOCUMENT_KINDS.some((k) => k === value);

export type NewDocumentBlank = {
  id: NewDocumentBlankId;
  /** "Diagram": the row's name, and the face's "New Diagram". */
  name: string;
  /** What the blank makes: its blank template; a kind's reads 'blank' and is never made. */
  blank: TemplateKind;
  /** Where the pane's templates come from; none for a kind, whose gallery is still to come. */
  templates: NewDocumentTemplateSource | null;
  /** The document kind it makes, for a kind's blank. */
  kind?: NewDocumentKind;
  /** What a kind makes, in one line, said in its pane (D227). */
  pitch?: string;
};

export const NEW_DOCUMENT_BLANKS: readonly NewDocumentBlank[] = [
  {
    id: 'diagram',
    name: 'Diagram',
    blank: 'blank',
    templates: { start: 'diagram' },
  },
  {
    id: 'whiteboard',
    name: 'Whiteboard',
    blank: 'whiteboard',
    templates: { start: 'draw' },
  },
  {
    id: 'brainstorm',
    name: 'Brainstorm',
    blank: 'blank-brainstorm',
    templates: { start: 'diagram', group: 'mindmaps' },
  },
  {
    id: 'text-document',
    name: 'Text document',
    blank: 'blank',
    templates: null,
    kind: 'text-document',
    pitch: 'An empty text document, with pages, styles and comments, as Google Docs makes one.',
  },
  {
    id: 'spreadsheet',
    name: 'Spreadsheet',
    blank: 'blank',
    templates: null,
    kind: 'spreadsheet',
    pitch: 'An empty spreadsheet of one sheet, with formulas, charts and filters.',
  },
  {
    id: 'pdf-document',
    name: 'PDF document',
    blank: 'blank',
    templates: null,
    kind: 'pdf-document',
    pitch: 'A blank PDF page to write and sign on, or a PDF file of your own.',
  },
  {
    id: 'board',
    name: 'Board',
    blank: 'blank-board',
    templates: { plan: 'boards' },
  },
  {
    id: 'form',
    name: 'Form',
    blank: 'blank-form',
    templates: { plan: 'forms' },
  },
  {
    id: 'workshop',
    name: 'Workshop',
    blank: 'blank-session',
    templates: { start: 'workshop' },
  },
];

/** The blank of an id; an unknown id reads as null. */
export function newDocumentBlankOf(id: string | null | undefined): NewDocumentBlank | null {
  return NEW_DOCUMENT_BLANKS.find((b) => b.id === id) ?? null;
}

/** What a blank's templates open as. */
export function newDocumentTemplateMode(source: NewDocumentTemplateSource): TabOpening {
  return 'plan' in source ? 'plan' : source.start;
}
