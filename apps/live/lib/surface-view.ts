import { debugLog } from '@/lib/debug-log';

// A surface's view, remembered per document and tab in this browser (docs/specs/006-document/kinds-outside-the-canvas.md
// "Switching tabs"): where it was scrolled to and, for a text document, its selection, so switching back to the tab
// finds it where it was left. The most recent SURFACE_VIEW_MAX_ENTRIES are kept, the oldest forgotten first.

/** How many tabs' views are remembered (default): far past the tabs one person switches between. */
export const SURFACE_VIEW_MAX_ENTRIES = 200;
/** How often a surface writes its view while it scrolls or its selection moves, at most (default). */
export const SURFACE_VIEW_WRITE_MS = 250;
/** How many frames a restored scroll is put again while the surface's content still grows (default): half a second. */
export const SURFACE_VIEW_SETTLE_FRAMES = 30;
export const SURFACE_VIEWS_KEY = 'livedoc:v2:surface-views';

export type SurfaceSelection = { anchor: number; head: number };
export type SurfaceView = {
  scrollTop: number;
  scrollLeft: number;
  // A text document's selection, as positions in its body; null where the surface has none.
  selection: SurfaceSelection | null;
};

type Entry = [key: string, view: unknown];

const keyOf = (documentId: string, tabId: string) => `${documentId}\u0000${tabId}`;
const isOffset = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function parseSelection(value: unknown): SurfaceSelection | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'object') return undefined;
  const { anchor, head } = value as Record<string, unknown>;
  return isOffset(anchor) && isOffset(head) ? { anchor, head } : undefined;
}

function parseView(value: unknown): SurfaceView | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const selection = parseSelection(v.selection);
  if (!isOffset(v.scrollTop) || !isOffset(v.scrollLeft) || selection === undefined) return null;
  return { scrollTop: v.scrollTop, scrollLeft: v.scrollLeft, selection };
}

function readEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(SURFACE_VIEWS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is Entry => Array.isArray(e) && e.length === 2 && typeof e[0] === 'string',
    );
  } catch {
    return [];
  }
}

function writeEntries(entries: Entry[]): void {
  try {
    localStorage.setItem(SURFACE_VIEWS_KEY, JSON.stringify(entries));
  } catch (error) {
    // A full or blocked storage forgets views; the surface still works, opening at its top.
    debugLog(`[surface-view] write failed ${String(error)}`);
  }
}

/** The view remembered for a document's tab, or null; one that no longer parses is forgotten. */
export function readSurfaceView(documentId: string, tabId: string): SurfaceView | null {
  const key = keyOf(documentId, tabId);
  const entries = readEntries();
  const found = entries.find(([k]) => k === key);
  if (!found) return null;
  const view = parseView(found[1]);
  if (!view) {
    debugLog(`[surface-view] forgot reason=unparsable tab=${tabId}`);
    writeEntries(entries.filter(([k]) => k !== key));
  }
  return view;
}

/** Remember a document's tab's view as the most recent, forgetting the oldest past the cap. */
export function writeSurfaceView(documentId: string, tabId: string, view: SurfaceView): void {
  const key = keyOf(documentId, tabId);
  const rest = readEntries().filter(([k]) => k !== key);
  writeEntries([...rest, [key, view] as Entry].slice(-SURFACE_VIEW_MAX_ENTRIES));
}

/** Put a surface's scroller where a remembered view had it. */
export function scrollSurfaceTo(element: HTMLElement, view: SurfaceView): void {
  element.scrollTop = view.scrollTop;
  element.scrollLeft = view.scrollLeft;
}
