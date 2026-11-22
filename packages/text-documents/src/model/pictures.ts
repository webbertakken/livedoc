// Pictures in line (docs/specs/034-text-documents/objects.md "The model"): an inline of a paragraph holding its media by
// key, the size it shows at, its alternative text, title, whether it is decorative and its crop; the bytes are the
// document's `media`, by the SHA-256 of their bytes, so two pictures of the same bytes share one.
import type { MappedPictureType } from '@livedoc/office-packages';
import type { KeptProperties, TextProps } from './props';
import type { Block, Inline } from './blocks';
import { HEADER_FOOTER_KINDS, HEADER_FOOTER_SLOTS, type SectionHeaders } from './headers';
import type { TextDocument } from './text-document';

/** The share of the picture's own width or height cut from each side, each from 0 to below 1. */
export type PictureCrop = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

export type Picture = {
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
  /** The formatting of the run it sits in. */
  readonly props: TextProps;
  readonly style?: string;
  readonly link?: string;
  readonly kept?: KeptProperties;
};

/** A picture's bytes, their media type, and the package entry they arrived in, which they are written back to. */
export type PictureMedia = {
  readonly mediaType: MappedPictureType;
  readonly bytes: Uint8Array;
  readonly part?: string;
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
    ...Pictures.in(document.body),
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
  /** A crop that cuts nothing is no crop. */
  crop: (crop: PictureCrop | undefined): PictureCrop | undefined =>
    crop && sides.some((side) => crop[side] > 0) ? crop : undefined,
  /** Whether a crop is one a picture can hold: each side from 0, and what is left of each axis more than nothing. */
  isCrop: (crop: PictureCrop): boolean =>
    sides.every((side) => Number.isFinite(crop[side]) && crop[side] >= 0) &&
    crop.left + crop.right < 1 &&
    crop.top + crop.bottom < 1,
} as const;
