// A drawing's picture (docs/specs/034-text-documents/objects.md "Its picture"): its drawing tab as a PNG at twice its
// size (the export's own scale) on a transparent ground, its icons and photos drawn as the canvas draws them.
import type { Tab } from '@livedoc/document';
import { exportTabAsPng, loadTabImages } from '@/lib/export-tab';
import { ensureIconCatalogs } from '@/lib/icon-registry';

export async function drawingPicture(
  tab: Tab,
  imageContext: { ownerId: string; documentId: string; shareCode: string | null } | null,
): Promise<Uint8Array> {
  await ensureIconCatalogs();
  const images = imageContext ? await loadTabImages(tab, imageContext) : undefined;
  const png = await exportTabAsPng(tab, { transparentPaper: true, pattern: false, images });
  return new Uint8Array(await png.arrayBuffer());
}
