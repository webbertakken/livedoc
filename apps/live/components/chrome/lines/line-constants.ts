// The editor's two lines (docs/specs/007-editor/toolbar-layout.md).

/** Avatars the contributors' button shows before it says +N. Spec: up to three. Safe range 1 to 5. */
export const CONTRIBUTORS_SHOWN = 3;

/** The tab list shows Find a Tab from this many tabs (above five). Default ledger. Safe range 4 to 10. */
export const TAB_LIST_FILTER_FROM = 6;

/** The tab list's width in px. Mock-up F. Safe range 280 to 400. */
export const TAB_LIST_WIDTH_PX = 320;

/** The gap between the tab list and the button it hangs above, in px (its arrow sits in it). Mock-up F. 6 to 12. */
export const TAB_LIST_GAP_PX = 10;

/** How far inside the canvas the tab list keeps, in px. Spec. Safe range 8 to 16. */
export const TAB_LIST_EDGE_PX = 12;

/** The least the document's name shortens to, in px. Spec: down to 72 px. Safe range 48 to 120. */
export const DOC_NAME_MIN_PX = 72;
