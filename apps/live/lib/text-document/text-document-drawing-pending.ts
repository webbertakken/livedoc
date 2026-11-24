// A drawing on its way into the writing (docs/specs/034-text-documents/objects.md "Where it goes", "Its picture"):
// where it goes, kept in this browser's session from Insert > Drawing > New until Save and close, by its drawing tab;
// and the picture Save and close made, held here until its text document's surface places it.

/** Where a drawing goes: its text document tab, the document tab inside it, and the caret as a relative position. */
export type DrawingWhere = {
  readonly textDocumentTabId: string;
  readonly documentTab: string;
  readonly anchor: string | null;
};

/** A drawing's picture: its PNG, and its gallery id (null where the document keeps its bytes). */
export type DrawingPicture = { readonly bytes: Uint8Array; readonly stored: string | null };

export const DRAWING_PENDING_KEY = 'livedoc:drawing-pending:v1';

const ready = new Map<string, DrawingPicture>();

function read(): Record<string, DrawingWhere> {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(DRAWING_PENDING_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, DrawingWhere>) : {};
  } catch {
    return {};
  }
}

function write(all: Record<string, DrawingWhere>): void {
  try {
    sessionStorage.setItem(DRAWING_PENDING_KEY, JSON.stringify(all));
  } catch {
    // A session that holds nothing more keeps the drawing open; its place is then the end of the body.
  }
}

export function putDrawingPending(drawingTabId: string, where: DrawingWhere): void {
  write({ ...read(), [drawingTabId]: where });
}

export function drawingPending(drawingTabId: string): DrawingWhere | null {
  return read()[drawingTabId] ?? null;
}

/** Save and close's picture, ready for its text document to place. */
export function drawingReady(drawingTabId: string, picture: DrawingPicture): void {
  ready.set(drawingTabId, picture);
}

/** The drawing ready to be placed in a text document tab, or null. */
export function readyDrawingFor(
  textDocumentTabId: string,
): ({ drawingTabId: string; where: DrawingWhere } & DrawingPicture) | null {
  const all = read();
  for (const [drawingTabId, picture] of ready) {
    const where = all[drawingTabId];
    if (where?.textDocumentTabId === textDocumentTabId) return { drawingTabId, where, ...picture };
  }
  return null;
}

/** The drawing placed or given up: nothing more waits for it. */
export function takeDrawing(drawingTabId: string): void {
  ready.delete(drawingTabId);
  const { [drawingTabId]: _gone, ...rest } = read();
  write(rest);
}
