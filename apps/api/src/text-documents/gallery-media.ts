// A file's pictures into the opener's gallery (docs/specs/034-text-documents/objects.md "Where the bytes live",
// "Opening a file"): each media its pictures hold is stored as the opener's gallery image, once per key, before the
// state is written, and its entry names the image instead of holding the bytes. A media the gallery refuses keeps its
// bytes, so the document still opens whole; each refusal is counted by its reason.
import { pictureHeader } from '@livedoc/office-packages';
import { Pictures, type PictureMedia, type TextDocument } from '@livedoc/text-documents';
import { servableImageIds } from '../db/image-grants';
import { hasImageStore, storeGalleryImage } from '../gallery-store';
import type { Env } from '../types';

/** How many pictures are stored at once: a file's pictures land in a few round trips, never one at a time. */
export const GALLERY_IMPORT_CONCURRENCY = 4;

export type GalleryImport = {
  readonly document: TextDocument;
  /** Media now named in the gallery. */
  readonly gallery: number;
  /** Media whose bytes stay in the state, by the reason the gallery refused each. */
  readonly kept: Readonly<Record<string, number>>;
};

/** The document with each held media stored in the owner's gallery, and what was kept and why. */
export async function mediaIntoGallery(
  env: Env,
  ownerId: string,
  document: TextDocument,
): Promise<GalleryImport> {
  const held = Pictures.heldMedia(document).filter(([, m]) => Pictures.holdsBytes(m));
  if (held.length === 0) return { document, gallery: 0, kept: {} };
  const kept: Record<string, number> = {};
  const keep = (reason: string) => {
    kept[reason] = (kept[reason] ?? 0) + 1;
  };
  if (!hasImageStore(env)) {
    for (const _ of held) keep('images_unavailable');
    return { document, gallery: 0, kept };
  }
  const media: Record<string, PictureMedia> = { ...document.media };
  let gallery = 0;
  for (let at = 0; at < held.length; at += GALLERY_IMPORT_CONCURRENCY) {
    await Promise.all(
      held.slice(at, at + GALLERY_IMPORT_CONCURRENCY).map(async ([key, m]) => {
        if (!Pictures.holdsBytes(m)) return;
        const header = pictureHeader(m.bytes);
        if (!header) return keep('unsupported_type');
        const stored = await storeGalleryImage(env, ownerId, {
          bytes: m.bytes.slice().buffer,
          contentType: m.mediaType,
          width: header.width,
          height: header.height,
          originalName: null,
        }).catch((error: unknown) => {
          // The store failing outright (D1 or R2 down) keeps the bytes, as a refusal would: the file still opens.
          console.error(`[text-document] media-store-failed key=${key} error=${String(error)}`);
          return { ok: false as const, error: 'store_failed' as const };
        });
        if (!stored.ok) return keep(stored.error);
        media[key] = {
          mediaType: m.mediaType,
          ...(m.part ? { part: m.part } : {}),
          image: stored.image.id,
        };
        gallery += 1;
      }),
    );
  }
  return { document: { ...document, media }, gallery, kept };
}

/**
 * The document with each gallery media its pictures hold read back from image storage, under the placement rules the
 * byte endpoint serves by (docs/specs/009-elements/images.md "Placement grants"): what a file is written from.
 * `unavailable` names the media it could not read, whose pictures the file leaves out.
 */
export async function galleryMediaRead(
  env: Env,
  documentId: string,
  document: TextDocument,
): Promise<{ document: TextDocument; unavailable: string[] }> {
  const ids = Pictures.heldMedia(document).flatMap(([, m]) => (m.image ? [m.image] : []));
  if (ids.length === 0) return { document, unavailable: [] };
  const images = env.IMAGES;
  const servable = images ? await servableImageIds(env, documentId, [...new Set(ids)]) : new Set();
  return Pictures.resolveMedia(document, async (id) => {
    if (!images || !servable.has(id)) return undefined;
    const object = await images.get(id);
    return object ? new Uint8Array(await object.arrayBuffer()) : undefined;
  });
}
