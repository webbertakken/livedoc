// A file's pictures over the cells stored on opening (docs/specs/029-sheets/standard-mapping.md "Pictures in the
// file", "Stored on opening", D628): each through the import image pipeline's session into the opener's gallery, its
// named failure said as the read names a picture left out.
import type { PictureStore, PictureStored } from '@livedoc/sheets/files';
import type {
  ImportImageFailure,
  ImportImageOutcome,
  ImportImageSession,
} from '@/lib/import-images';

const WHY: Readonly<Record<ImportImageFailure, Extract<PictureStored, { ok: false }>['why']>> = {
  'missing-bytes': 'unreadable',
  unsupported: 'unreadable',
  'too-large': 'too_large',
  'gallery-full': 'gallery_full',
  'images-unavailable': 'unavailable',
  'offline-budget': 'failed',
  'upload-failed': 'failed',
};

/** The pipeline's outcome as the read takes it: the gallery's image id, or why it was not stored. */
export const pictureStoredOf = (outcome: ImportImageOutcome): PictureStored =>
  outcome.ok ? { ok: true, imageId: outcome.imageId } : { ok: false, why: WHY[outcome.failure] };

/** A file's picture store over a session the first picture opens, so a file without pictures loads no pipeline. */
export function spreadsheetPictureStore(session: () => Promise<ImportImageSession>): PictureStore {
  let opened: Promise<ImportImageSession> | null = null;
  return async ({ data, type }) => {
    opened ??= session();
    const blob = new Blob([new Uint8Array(data)], { type });
    return pictureStoredOf(await (await opened).store({ kind: 'blob', blob }));
  };
}
