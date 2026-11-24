// Pictures in line (docs/specs/034-text-documents/objects.md "The model"): an inline of a paragraph holding its media by
// key, the size it shows at, its alternative text, title, whether it is decorative, its crop, turn, recolour and
// adjustments; the bytes are the document's `media`, by the SHA-256 of their bytes, so two pictures of the same bytes
// share one.
import type { MappedPictureType } from '@livedoc/office-packages';
import type { PictureColouring } from './picture-colours';
import type { PicturePlacement } from './picture-placement';
import type { KeptProperties, TextProps } from './props';
import type { Block, Inline } from './blocks';
import { HEADER_FOOTER_KINDS, HEADER_FOOTER_SLOTS, type SectionHeaders } from './headers';
import type { TextDocument } from './text-document';
import { DocumentTabs } from './document-tabs';

/** The share of the picture's own width or height cut from each side, each from 0 to below 1. */
export type PictureCrop = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

/** A picture in line; its recolour and adjustments are its `PictureColouring`. */
export type Picture = PictureColouring & {
  readonly type: 'picture';
  /** Its media's key in the document's `media`. */
  readonly media: string;
  /** The size it shows at, in points: what the crop leaves. */
  readonly width: number;
  readonly height: number;
  /** Alternative text: what a reader that cannot see it is told. */
  readonly alt?: string;
  readonly title?: string;
  readonly decorative?: true;
  readonly crop?: PictureCrop;
  /** The angle it is turned clockwise about its centre, in degrees from 0 to below 360; none is 0. */
  readonly rotation?: number;
  /** Where it stands out of its line, and how the text meets it; none is in line. */
  readonly placement?: PicturePlacement;
  /** The formatting of the run it sits in. */
  readonly props: TextProps;
  readonly style?: string;
  readonly link?: string;
  readonly kept?: KeptProperties;
};

/**
 * A picture's media type, the package entry it arrived in (written back to), and where its bytes live
 * (objects.md "Where the bytes live"): held here, or a gallery image named by id.
 */
export type PictureMedia = HeldPictureMedia | GalleryPictureMedia;

/** Media whose bytes are in hand: what a file is written from. */
export type HeldPictureMedia = {
  readonly mediaType: MappedPictureType;
  readonly part?: string;
  readonly bytes: Uint8Array;
  readonly image?: never;
};

/** Media whose bytes are a gallery image's, read back by its id before a file is written. */
export type GalleryPictureMedia = {
  readonly mediaType: MappedPictureType;
  readonly part?: string;
  readonly image: string;
  readonly bytes?: never;
};

export type DocumentMedia = Readonly<Record<string, PictureMedia>>;

function* headerInlines(headers: SectionHeaders | undefined): Generator<Inline> {
  for (const kind of HEADER_FOOTER_KINDS)
    for (const slot of HEADER_FOOTER_SLOTS) {
      const story = headers?.[kind]?.[slot];
      if (story) yield* inlinesOf(story.blocks);
    }
}

const sides = ['top', 'right', 'bottom', 'left'] as const;

/** A turn is held to two decimals of a degree (default). */
const ROTATION_PRECISION = 100;
const round2 = (n: number) => Math.round(n * ROTATION_PRECISION) / ROTATION_PRECISION;

/** Every inline of the blocks, in reading order: those in table cells and notes too. */
function* inlinesOf(blocks: readonly Block[]): Generator<Inline> {
  for (const block of blocks) {
    if (block.type === 'table') {
      for (const row of block.rows) for (const cell of row.cells) yield* inlinesOf(cell.blocks);
    } else if (block.type === 'paragraph') {
      for (const inline of block.inlines) {
        yield inline;
        if (inline.type === 'note') yield* inlinesOf(inline.blocks);
      }
    } else if (block.type === 'section') yield* headerInlines(block.headers);
  }
}

export const Pictures = {
  /** Every picture of the blocks, in reading order, those in cells, notes and a section break's headers included. */
  in: (blocks: readonly Block[]): Picture[] =>
    [...inlinesOf(blocks)].filter((i): i is Picture => i.type === 'picture'),
  /** Every picture of the document: its body's, and its first section's headers' and footers'. */
  ofDocument: (document: TextDocument): Picture[] => [
    ...Pictures.in(DocumentTabs.blocks(document)),
    ...[...headerInlines(document.section.headers)].filter(
      (i): i is Picture => i.type === 'picture',
    ),
  ],
  /** The document's media its pictures hold, by key, in the order they first appear. */
  heldMedia: (document: TextDocument): [string, PictureMedia][] => {
    const keys = new Set(Pictures.ofDocument(document).map((p) => p.media));
    return [...keys].flatMap((key) => {
      const media = document.media?.[key];
      return media ? [[key, media] as [string, PictureMedia]] : [];
    });
  },
  /** Whether the media's bytes are in hand. */
  holdsBytes: (media: PictureMedia): media is HeldPictureMedia => media.bytes instanceof Uint8Array,
  /** The media of the key with its bytes in hand; none for a gallery media not yet read. */
  heldBytes: (document: TextDocument, key: string): HeldPictureMedia | undefined => {
    const media = document.media?.[key];
    return media && Pictures.holdsBytes(media) ? media : undefined;
  },
  /**
   * The document with each gallery media its pictures hold read into bytes, each image once; `unavailable` names
   * the keys whose bytes could not be read (a read answering nothing, or failing), which stay as they were.
   */
  resolveMedia: async (
    document: TextDocument,
    read: (imageId: string) => Promise<Uint8Array | undefined>,
  ): Promise<{ document: TextDocument; unavailable: string[] }> => {
    const wanted = Pictures.heldMedia(document).filter(
      (entry): entry is [string, GalleryPictureMedia] => !Pictures.holdsBytes(entry[1]),
    );
    if (wanted.length === 0) return { document, unavailable: [] };
    const ids = [...new Set(wanted.map(([, m]) => m.image))];
    const bytes = new Map(
      await Promise.all(
        ids.map(
          async (id) =>
            [
              id,
              await Promise.resolve()
                .then(() => read(id))
                .catch(() => undefined),
            ] as const,
        ),
      ),
    );
    const media: Record<string, PictureMedia> = { ...document.media };
    const unavailable: string[] = [];
    for (const [key, m] of wanted) {
      const got = bytes.get(m.image);
      if (!got) unavailable.push(key);
      else media[key] = { mediaType: m.mediaType, ...(m.part ? { part: m.part } : {}), bytes: got };
    }
    return { document: { ...document, media }, unavailable };
  },
  /** A crop that cuts nothing is no crop. */
  crop: (crop: PictureCrop | undefined): PictureCrop | undefined =>
    crop && sides.some((side) => crop[side] > 0) ? crop : undefined,
  /** A turn as a picture holds it: clockwise from 0 to below 360, to two decimals; none for no turn or no number. */
  rotation: (value: unknown): number | undefined => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    const turn = round2(((value % 360) + 360) % 360) % 360;
    return turn === 0 ? undefined : turn;
  },
  /** The bounds of a picture of `size` turned by `rotation`: what its line makes room for, in points. */
  turnedBounds: (
    size: { readonly width: number; readonly height: number },
    rotation: number | undefined,
  ): { width: number; height: number } => {
    const radians = ((rotation ?? 0) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    return {
      width: size.width * cos + size.height * sin,
      height: size.width * sin + size.height * cos,
    };
  },
  /** Whether a crop is one a picture can hold: each side from 0, and what is left of each axis more than nothing. */
  isCrop: (crop: PictureCrop): boolean =>
    sides.every((side) => Number.isFinite(crop[side]) && crop[side] >= 0) &&
    crop.left + crop.right < 1 &&
    crop.top + crop.bottom < 1,
} as const;
