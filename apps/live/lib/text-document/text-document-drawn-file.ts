// A download's drawings (docs/specs/034-text-documents/objects.md "In the file"): each drawing the writing names, drawn
// afresh into the file alone, one at a time to bound memory. One that is not drawn (not here, not shared, not loaded,
// or failing) leaves with the picture last saved.
import { debugLog } from '@/lib/debug-log';

/** Each drawing's PNG by its drawing tab's id, for those drawn. */
export async function drawingsForFile(
  ids: Iterable<string>,
  draw: (drawingTabId: string) => Promise<Uint8Array | null>,
): Promise<Map<string, Uint8Array>> {
  const drawn = new Map<string, Uint8Array>();
  for (const id of ids) {
    try {
      const bytes = await draw(id);
      if (bytes) drawn.set(id, bytes);
      else debugLog('[text-document] drawing left as saved', { drawing: id });
    } catch (error) {
      debugLog('[text-document] drawing not drawn for the file', {
        drawing: id,
        error: String(error),
      });
    }
  }
  return drawn;
}
