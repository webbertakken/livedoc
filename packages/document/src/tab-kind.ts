// What KIND a tab is (docs/specs/021-event-storming/event-storming.md). A leaf module: the Tab type
// imports the union, and the editor's commit choke point stamps it.
//
// The set is TOTAL — 'diagram' is a real member, not an absence — so code
// switches over a complete union and a future third kind can't be quietly
// forgotten in a branch. "Ordinary tab" is a thing the model can say.
import type { Layer } from './layers';
import { isEventStormingTab } from './event-storming';

// Whiteboarding is an editor mode, not a kind (docs/specs/007-editor/editor-modes.md): a stored
// 'whiteboard' is migrated on read into a general tab that opens in Draw (./legacy-whiteboard-tab).
// Board, Sheet and Dashboard are the Plan tab kinds (docs/specs/026-plan/plan-tabs.md), and Form
// (docs/specs/030-forms/forms.md).
// Every kind, for a reader that checks one from outside (a bug report's context).
export const TAB_KINDS = [
  'diagram',
  'event-storming',
  'board',
  'sheet',
  'dashboard',
  'form',
  // A text document (docs/specs/034-text-documents/text-document.md): pages of writing on an open standard, worked
  // on its own surface outside the canvas, in no editor mode.
  'text-document',
] as const;
export type TabKind = (typeof TAB_KINDS)[number];

export const PLAN_TAB_KINDS = ['board', 'sheet', 'dashboard', 'form'] as const;
export type PlanTabKind = (typeof PLAN_TAB_KINDS)[number];

// The tab is a Board, Sheet, Dashboard or Form tab: always in Plan mode.
export function isPlanTabKind(kind: string | undefined): kind is PlanTabKind {
  return kind === 'board' || kind === 'sheet' || kind === 'dashboard' || kind === 'form';
}

export const DEFAULT_TAB_KIND: TabKind = 'diagram';

// Tabs written before the field existed (every row already in D1, every
// IndexedDB record, every exported JSON) carry no `kind`, and that will be
// true forever — no migration reaches an exported file or someone else's
// offline copy. So absence MUST keep reading as the default, whatever new
// tabs store.
export function tabKindOf(tab: { kind?: string } | undefined): TabKind {
  switch (tab?.kind) {
    case 'event-storming':
    case 'board':
    case 'sheet':
    case 'dashboard':
    case 'form':
    case 'text-document':
      return tab.kind;
    default:
      return DEFAULT_TAB_KIND;
  }
}

// Write the resolved kind onto a tab, so a saved tab says what it is rather
// than leaving the reader to know the convention.
//
// The stamp is a ONE-WAY write — whatever it puts on a tab is what that tab
// is from then on — so it resolves the kind exactly as a READER would,
// legacy signals included. A board authored before the field is recognised
// by the layer its template shipped; branding it 'diagram' would take its
// palette, stationery and note menu away permanently, and no later load
// could tell that had happened.
//
// Returns the SAME object when nothing needs stamping: this runs at the
// editor's commit choke point over every tab of every commit, and minting a
// fresh object for an unchanged tab would ripple through the memoised views
// downstream for no reason.
export function stampTabKind<T extends { kind?: string; layers?: Layer[] }>(tab: T): T {
  if (tab.kind !== undefined) return tab;
  return { ...tab, kind: isEventStormingTab(tab) ? 'event-storming' : DEFAULT_TAB_KIND };
}

// Which standard a text document is held in (docs/specs/034-text-documents/text-document.md "The format it is in"):
// ODF or OOXML, the format it arrived in. A text document made in LiveDoc is born in ODF (fork C5), so absence reads
// as ODF.
export const TEXT_DOCUMENT_FORMATS = ['odf', 'ooxml'] as const;
export type TextDocumentFormat = (typeof TEXT_DOCUMENT_FORMATS)[number];
export const BORN_TEXT_DOCUMENT_FORMAT: TextDocumentFormat = 'odf';

export function textDocumentFormatOf(tab: { format?: unknown }): TextDocumentFormat {
  return tab.format === 'ooxml' ? 'ooxml' : BORN_TEXT_DOCUMENT_FORMAT;
}

export function isTextDocumentTab(tab: { kind?: string } | undefined): boolean {
  return tabKindOf(tab) === 'text-document';
}
