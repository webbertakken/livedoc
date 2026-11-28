// A gallery picture's size in pixels, for placing a cell's picture over the cells as Insert places one
// (docs/specs/029-sheets/inserted-objects.md "Images in a cell", D632): its bytes decoded at up to the largest side an
// image over cells takes, exact for any size Insert's 600 by 400 box would keep, in proportion past it. Null when the
// bytes do not come or do not decode.
import { SHEET_IMAGE_SIZE } from '@livedoc/sheets';
import { apiFetchImageBlobUrl, releaseImageBlobUrl } from '@/lib/api-client';
import type { SheetImageAccess } from '@/components/sheets/sheet-images-over-cells-context';

export async function pictureNaturalSize(
  access: SheetImageAccess,
  imageId: string,
): Promise<{ width: number; height: number } | null> {
  const url = await apiFetchImageBlobUrl(access.ownerId, imageId, {
    documentId: access.documentId,
    shareCode: access.shareCode,
    maxEdge: SHEET_IMAGE_SIZE.max,
  }).catch(() => null);
  if (!url) return null;
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    return null;
  } finally {
    releaseImageBlobUrl(url);
  }
}
