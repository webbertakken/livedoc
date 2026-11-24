// A tab's default name (docs/specs/026-plan/plan-board.md "The board set-up"): "Tab N", what a tab is called until someone
// names it. A Plan board or Sheet placed on a tab takes the tab's name, and follows it when the tab is renamed away
// from its default (docs/specs/026-plan/plan-board.md "The board set-up").
import { listedTabs } from './drawing-tabs';

const DEFAULT_TAB_NAME = /^Tab \d+$/;

export function defaultTabName(n: number): string {
  return `Tab ${n}`;
}

export function isDefaultTabName(name: string): boolean {
  return DEFAULT_TAB_NAME.test(name.trim());
}

// Naming the document names its first tab while that tab still has its default name
// (docs/specs/006-document/document-structure.md "Naming the document names its first tab"): the tab to rename and
// its new name, or null when none takes it. Only the first tab, so two tabs never share the name.
export function tabNamedByDocument(
  tabs: readonly { id: string; name: string }[],
  documentName: string,
): { id: string; name: string } | null {
  const name = documentName.trim();
  // The first listed tab: a text document's drawing tabs never count (docs/specs/034-text-documents/objects.md).
  const first = listedTabs(tabs)[0];
  if (!name || !first || !isDefaultTabName(first.name)) return null;
  return { id: first.id, name };
}
