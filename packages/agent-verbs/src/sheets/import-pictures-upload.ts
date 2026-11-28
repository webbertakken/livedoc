// A file's pictures over the cells stored for an agent's import (docs/specs/029-sheets/standard-mapping.md "Pictures
// in the file", "Stored on opening", D628): each uploaded to the caller's gallery as it is, as the image picker
// uploads one; a picture past the gallery's 10 MB is not sent, and the gallery's refusal is said as the read names a
// picture left out.
import { ApiError, type ApiClient } from '@livedoc/api-client';
import { MAX_IMAGE_BYTES } from '@livedoc/api-schema';
import type { PictureStore, PictureStored } from '@livedoc/sheets/files';

type Why = Extract<PictureStored, { ok: false }>['why'];

// The gallery's refusals by their code (apps/api routes/images.ts).
const REFUSED: Readonly<Record<string, Why>> = {
  file_too_large: 'too_large',
  unsupported_type: 'unreadable',
  malformed_jpeg: 'unreadable',
  gallery_full: 'gallery_full',
  images_unavailable: 'unavailable',
};

/** Why the gallery did not take an upload: its refusal's code, a 503 as no image storage, else failed. */
export function uploadRefusalOf(error: unknown): Why {
  if (!(error instanceof ApiError)) return 'failed';
  return REFUSED[error.code ?? ''] ?? (error.status === 503 ? 'unavailable' : 'failed');
}

/** Uploads each picture to the caller's gallery; never throws, a refusal named and logged. */
export function galleryPictureStore(
  api: ApiClient,
  headers: Record<string, string>,
  log: (event: string, data: Record<string, unknown>) => void,
): PictureStore {
  return async ({ data, type, natural }) => {
    if (data.byteLength > MAX_IMAGE_BYTES) {
      log('[workbook] picture not stored', { why: 'too_large', bytes: data.byteLength });
      return { ok: false, why: 'too_large' };
    }
    try {
      const { image } = await api.json<{ image: { id: string } }>('/images', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': type,
          'X-Image-Width': String(natural.width),
          'X-Image-Height': String(natural.height),
        },
        body: new Uint8Array(data),
      });
      return { ok: true, imageId: image.id };
    } catch (error) {
      const why = uploadRefusalOf(error);
      log('[workbook] picture not stored', { why, error: String(error) });
      return { ok: false, why };
    }
  };
}
