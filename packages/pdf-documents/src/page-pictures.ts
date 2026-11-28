// A page's pictures as the engine hands them over (docs/specs/035-pdf-documents/opening.md "What is read": a page's
// pictures): each image the page draws, where it is drawn and its bytes, for a caller that moves them into another
// document.
import type { PageMatrix } from './engine-contract';

/** A picture's bytes: a JPEG as the file holds it, or its pixels (red, green, blue, alpha a byte each, from the top). */
export type PagePictureBytes =
  | { readonly type: 'image/jpeg'; readonly bytes: Uint8Array<ArrayBuffer> }
  | {
      readonly type: 'rgba';
      readonly width: number;
      readonly height: number;
      readonly pixels: Uint8Array<ArrayBuffer>;
    };

/** One picture of a page, in page points (y up). */
export type PagePicture = {
  /** What places the picture's unit square on the page, through every form it sits in. */
  readonly matrix: PageMatrix;
  /** The box around its four corners. */
  readonly box: {
    readonly left: number;
    readonly bottom: number;
    readonly right: number;
    readonly top: number;
  };
  /** Its own size in pixels, as the file says it. */
  readonly width: number;
  readonly height: number;
  /** Its bytes; null when past `PDF_PICTURE_HANDED_MAX_PIXELS` or not decoded. */
  readonly picture: PagePictureBytes | null;
};

/** A page's pictures in the order its content draws them; `cut` when past `PDF_PAGE_PICTURES_MAX`. */
export type PagePictures = { readonly pictures: readonly PagePicture[]; readonly cut: boolean };
