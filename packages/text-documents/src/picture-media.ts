// Pictures' media as a read finds them (docs/specs/034-text-documents/objects.md "The model", "In the formats"): each
// candidate's bytes sniffed and hashed before the readers run (they are synchronous; hashing is not), then held once
// by key as the pictures read take them, up to `TEXT_DOCUMENT_MAX_OBJECTS`; afterwards, the entries pictures now hold
// leave the kept content, unless kept XML still names them.
import {
  isMappedPictureType,
  isPictureTooLarge,
  mediaKeyOf,
  pictureHeader,
  pictureOwnSize,
} from '@livedoc/office-packages';
import type { DocumentMedia, PictureMedia } from './model/pictures';

/** A picture's bytes as a read found them: their key and media, and the picture's own size in points. */
export type FoundMedia = {
  readonly key: string;
  readonly media: PictureMedia;
  readonly own: { readonly width: number; readonly height: number };
};

/** The bytes as media, when their header gives a mapped type; `too-large` past `PICTURE_MAX_PIXELS`. */
export async function findMedia(
  bytes: Uint8Array,
  part?: string,
): Promise<FoundMedia | 'too-large' | undefined> {
  if (isPictureTooLarge(bytes)) return 'too-large';
  const header = pictureHeader(bytes);
  if (!header || !isMappedPictureType(header.mediaType)) return undefined;
  const media: PictureMedia = { mediaType: header.mediaType, bytes, ...(part ? { part } : {}) };
  return { key: await mediaKeyOf(bytes), media, own: pictureOwnSize(header) };
}

/** The media the pictures of one read hold, and the entries they came from, up to the most a document holds. */
export class MediaTaken {
  readonly media: Record<string, PictureMedia> = {};
  /** The package entries pictures hold, by name. */
  readonly parts = new Set<string>();
  #count = 0;
  readonly #max: number;

  constructor(max: number) {
    this.#max = max;
  }

  /** Takes the media for one more picture; false past the most, when the picture stays kept. */
  take(found: FoundMedia): boolean {
    if (this.#count >= this.#max) return false;
    this.#count += 1;
    // The first entry of the same bytes is the one they are written back to.
    this.media[found.key] ??= found.media;
    if (found.media.part) this.parts.add(found.media.part);
    return true;
  }

  held(): DocumentMedia | undefined {
    return Object.keys(this.media).length > 0 ? this.media : undefined;
  }
}

/** Every kept XML string the value holds, at any depth: what kept content names. */
export function keptXmlTexts(value: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<object>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || v instanceof Uint8Array || seen.has(v)) return;
    seen.add(v);
    if (v instanceof Map) {
      for (const x of v.values()) walk(x);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    for (const [k, x] of Object.entries(v)) {
      if (k === 'xml' && typeof x === 'string') out.push(x);
      else walk(x);
    }
  };
  walk(value);
  return out;
}
