// Tab-scoped share links on the client (docs/specs/013-workspace/tab-scoped-share-links.md). A session opened
// through a link scoped to one tab can only make that tab, or one of its drawing tabs ("Drawing tabs"), active; the
// others are drawn as "Not shared" pills and their content is never requested.

// What the visitor is told when something tries to take them to another tab.
export const OUT_OF_SCOPE_MESSAGE = "That tab isn't shared with you";

/** A tab's text document tab when it is a drawing tab, else null. */
export type DrawingOf = (tabId: string) => string | null;
const NO_DRAWINGS: DrawingOf = () => null;

/** The drawing tabs among `tabs`, as a lookup. */
export function drawingOfTabs(tabs: readonly { id: string; drawingOf?: string }[]): DrawingOf {
  const of = new Map<string, string>();
  for (const tab of tabs) if (tab.drawingOf) of.set(tab.id, tab.drawingOf);
  return (tabId) => of.get(tabId) ?? null;
}

// Whether `tabId` is closed to a session scoped to `scope` (null = every tab
// is open: the owner, a team member, an All-tabs link).
export function isTabOutOfScope(
  tabId: string,
  scope: string | null,
  drawingOf: DrawingOf = NO_DRAWINGS,
): boolean {
  return scope !== null && tabId !== scope && drawingOf(tabId) !== scope;
}

// The tab whose content a freshly opened document fetches first and shows:
// the scoped tab when there is one, otherwise the first.
export function firstTabToLoad(
  tabs: readonly { id: string }[],
  scope: string | null,
): string | null {
  return scope ?? tabs[0]?.id ?? null;
}
