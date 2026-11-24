// A drawing's picture to show (docs/specs/034-text-documents/objects.md "The document around it"): a search hit on a
// drawing, or an address naming one, opens its text document with the picture selected and in view. The ask waits
// here, one per text document tab (the newest wins), until that tab's surface has its writing and takes it.

const asked = new Map<string, string>();
const listeners = new Set<(textTabId: string) => void>();

/** Asks the text document tab's surface to show the picture of this drawing tab. */
export function revealDrawingPicture(textTabId: string, drawingTabId: string): void {
  asked.set(textTabId, drawingTabId);
  for (const listener of listeners) listener(textTabId);
}

/** The drawing tab whose picture this text document tab should show, taken: asked once, shown once. */
export function takeDrawingReveal(textTabId: string): string | null {
  const drawing = asked.get(textTabId) ?? null;
  asked.delete(textTabId);
  return drawing;
}

/** Hears each ask, by text document tab; returns the unsubscribe. */
export function onDrawingReveal(listener: (textTabId: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
