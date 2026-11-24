// Drawing tabs (docs/specs/034-text-documents/objects.md "A drawing tab"): a general tab that belongs to one text
// document tab (its `drawingOf`), drawn in the writing as a picture and opened only from it. Never listed: every list
// of a document's tabs reads them through `listedTabs`, and an address naming one opens its text document tab.

type TabLike = { id: string; drawingOf?: string };

/** Whether the tab is a text document's drawing tab. */
export function isDrawingTab(tab: TabLike): boolean {
  return tab.drawingOf !== undefined;
}

/** The document's tabs as its lists show them: every one but the drawing tabs, in order. */
export function listedTabs<T extends TabLike>(tabs: readonly T[]): T[] {
  return tabs.filter((t) => !isDrawingTab(t));
}

/** The ids of the drawing tabs that belong to one text document tab, in order. */
export function drawingTabIdsOf(tabs: readonly TabLike[], textDocumentTabId: string): string[] {
  return tabs.filter((t) => t.drawingOf === textDocumentTabId).map((t) => t.id);
}

/** The tab an address naming `id` opens: a drawing tab's text document tab, the tab itself when listed, or null
 *  when there is none to open (no such tab, or a drawing tab whose text document tab is gone). */
export function listedTabIdFor(tabs: readonly TabLike[], id: string): string | null {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return null;
  if (!isDrawingTab(tab)) return tab.id;
  return tabs.some((t) => t.id === tab.drawingOf && !isDrawingTab(t)) ? tab.drawingOf! : null;
}

const DRAWING_NAME = /^Drawing (\d+)$/;

/** A new drawing tab's name in a text document: Drawing N, N one past the highest its drawings are named with. */
export function nextDrawingName(
  tabs: readonly (TabLike & { name: string })[],
  textDocumentTabId: string,
): string {
  const numbers = tabs
    .filter((t) => t.drawingOf === textDocumentTabId)
    .map((t) => Number(DRAWING_NAME.exec(t.name.trim())?.[1] ?? 0));
  return `Drawing ${Math.max(0, ...numbers) + 1}`;
}

/**
 * People by the tab they are on, as the document's lists show tabs (objects.md "Presence"): someone in a drawing tab is
 * in its text document tab (once each), the drawing tab's entry dropped; one whose text document tab is gone stays put.
 */
export function presenceOnListedTabs<P extends { id: string }>(
  byTab: ReadonlyMap<string, readonly P[]>,
  tabs: readonly TabLike[],
): Map<string, P[]> {
  const out = new Map<string, P[]>();
  for (const [tabId, people] of byTab) {
    const listed = listedTabIdFor(tabs, tabId) ?? tabId;
    const there = out.get(listed) ?? [];
    out.set(listed, [...there, ...people.filter((p) => !there.some((q) => q.id === p.id))]);
  }
  return out;
}
