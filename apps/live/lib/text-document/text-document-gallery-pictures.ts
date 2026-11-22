// A text document's pictures read from the gallery (docs/specs/034-text-documents/objects.md "Where the bytes live"):
// through the byte endpoint under the placement rules, for the document and the share link it is read by.
import { apiFetchImageBlobUrl, releaseImageBlobUrl } from '@/lib/api/images';
import type { TextDocumentScope } from '@/lib/api/text-documents';
import type { PictureSource } from './text-document-pictures';

export type GalleryPictures = Pick<PictureSource, 'gallery' | 'release'>;

/** Gallery images as the document's reader is served them. */
export const galleryPicturesOf = ({
  ownerId,
  documentId,
  shareCode,
}: Pick<TextDocumentScope, 'ownerId' | 'documentId' | 'shareCode'>): GalleryPictures => ({
  gallery: (imageId) => apiFetchImageBlobUrl(ownerId, imageId, { documentId, shareCode }),
  release: releaseImageBlobUrl,
});
