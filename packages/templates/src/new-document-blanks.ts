// The Explorer's New Document menu (docs/specs/013-workspace/new-document-menu.md "The blanks"): what a new document
// starts as, each a blank template and where its templates come from, which the menu lists in its pane. Pure data, in
// the menu's order; the number key of each is its place.
import type { TabOpening } from '@livedoc/document';
import type { TemplateKind } from './templates';

export const NEW_DOCUMENT_BLANK_IDS = [
  'diagram',
  'whiteboard',
  'brainstorm',
  'page',
  'sheet',
  'board',
  'slides',
  'form',
  'workshop',
] as const;

export type NewDocumentBlankId = (typeof NEW_DOCUMENT_BLANK_IDS)[number];

/**
 * Where a blank's templates come from: a template start's groups (all of them, or one), or one Plan family
 * (Sheet, Board and Form templates are Plan templates, listed by their family).
 */
export type NewDocumentTemplateSource =
  { start: Exclude<TabOpening, 'plan'>; group?: string } | { plan: 'sheets' | 'boards' | 'forms' };

export type NewDocumentBlank = {
  id: NewDocumentBlankId;
  /** "Diagram": the row's name, and the face's "New Diagram". */
  name: string;
  /** What the blank makes. */
  blank: TemplateKind;
  /** Where the pane's templates come from. */
  templates: NewDocumentTemplateSource;
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
    id: 'page',
    name: 'Page',
    blank: 'blank-article',
    templates: { start: 'pages', group: 'articles' },
  },
  {
    id: 'sheet',
    name: 'Sheet',
    blank: 'blank-spreadsheet',
    templates: { plan: 'sheets' },
  },
  {
    id: 'board',
    name: 'Board',
    blank: 'blank-board',
    templates: { plan: 'boards' },
  },
  {
    id: 'slides',
    name: 'Slides',
    blank: 'blank-slide-deck',
    templates: { start: 'pages', group: 'slides' },
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
