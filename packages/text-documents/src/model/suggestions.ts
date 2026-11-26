// Suggestions in the model (docs/specs/034-text-documents/review.md "How a suggestion is kept", "In the files"): each
// inline and paragraph carries the suggestions it is part of, as the live state's marks do, so the files' tracked
// changes and the live marks map one to one. A file's suggestion has the file's name for its author and no key.
import type { Block, Paragraph } from './blocks';
import type { ListPlace } from './lists';
import type { ParagraphProps, TextProps } from './props';
import { Blocks } from './tables';

/** Who made a suggestion: a file's name for them, or a LiveDoc person with their key and colour. */
export type FileSuggestionAuthor = {
  readonly name: string;
  readonly initials?: string;
  readonly key?: string;
  readonly colour?: string;
};

/** What every part of a suggestion carries: its id, when it was made (ms) and by whom. */
export type FileSuggestionMark = {
  readonly id: string;
  readonly at?: number;
  readonly author: FileSuggestionAuthor;
};

/** A run's format suggestion: its text style and formatting before it. */
export type FileFormatChange = FileSuggestionMark & {
  readonly before: { readonly style?: string; readonly props: TextProps };
};

/** A paragraph's format suggestion: its style, formatting and list place before it. */
export type FileParagraphFormatChange = FileSuggestionMark & {
  readonly before: {
    readonly style: string;
    readonly props: ParagraphProps;
    readonly list?: ListPlace;
  };
};

/** The suggestions an inline is part of: inserted, deleted, and (a run's only) formatted. */
export type InlineSuggested = {
  readonly insertion?: FileSuggestionMark;
  readonly deletion?: FileSuggestionMark;
  readonly format?: FileFormatChange;
};

/** A paragraph's suggestions: the break before it inserted, deleted (a join), and its paragraph format. */
export type ParagraphSuggested = {
  readonly break?: FileSuggestionMark;
  readonly join?: FileSuggestionMark;
  readonly format?: FileParagraphFormatChange;
};

/** The author a tracked change with no author reads as (review.md "In the files", (default)). */
export const UNKNOWN_SUGGESTION_AUTHOR = 'Unknown author';

/** The longest author name a file's suggestion keeps. */
export const FILE_SUGGESTION_AUTHOR_MAX = 100;

const sameMark = (a: FileSuggestionMark | undefined, b: FileSuggestionMark | undefined): boolean =>
  a?.id === b?.id;

export const Suggestions = {
  /** A file's author name, cut to its limit; the unknown author for none. */
  authorOf: (name: string | undefined): FileSuggestionAuthor => ({
    name: (name?.trim() || UNKNOWN_SUGGESTION_AUTHOR).slice(0, FILE_SUGGESTION_AUTHOR_MAX),
  }),
  /** Whether two inlines are part of the same suggestions, so their text may join. */
  sameInline: (a: InlineSuggested | undefined, b: InlineSuggested | undefined): boolean =>
    sameMark(a?.insertion, b?.insertion) &&
    sameMark(a?.deletion, b?.deletion) &&
    sameMark(a?.format, b?.format),
  /** Every suggestion mark the blocks hold, those in table cells and notes included. */
  marks: (blocks: readonly Block[]): FileSuggestionMark[] =>
    Blocks.paragraphs(blocks).flatMap((p) => [
      ...Object.values(p.suggested ?? {}),
      ...p.inlines.flatMap((i) => [
        ...(i.type === 'comment' ? [] : Object.values(i.suggested ?? {})),
        ...(i.type === 'note' ? Suggestions.marks(i.blocks) : []),
      ]),
    ]),
  /**
   * Each paragraph whose following paragraph's break or join it carries, as Word writes them on the paragraph before
   * the break (a section break between them aside), in the blocks and each table cell's. A break or join with no
   * paragraph before it in its list has no place in Word's files.
   */
  marksBefore: (blocks: readonly Block[]): Map<Paragraph, ParagraphSuggested> => {
    const out = new Map<Paragraph, ParagraphSuggested>();
    const walk = (list: readonly Block[]) => {
      let previous: Paragraph | undefined;
      for (const block of list) {
        if (block.type === 'section') continue;
        if (block.type === 'table')
          for (const row of block.rows) for (const cell of row.cells) walk(cell.blocks);
        if (block.type !== 'paragraph') {
          previous = undefined;
          continue;
        }
        const { break: inserted, join } = block.suggested ?? {};
        if (previous && (inserted || join))
          out.set(previous, {
            ...(inserted ? { break: inserted } : {}),
            ...(join ? { join } : {}),
          });
        previous = block;
      }
    };
    walk(blocks);
    return out;
  },
  /** An inline's suggestions with `more` laid over them; undefined for none. */
  merged: (
    under: InlineSuggested | undefined,
    more: InlineSuggested | undefined,
  ): InlineSuggested | undefined => {
    const out = { ...under, ...more };
    return Object.keys(out).length > 0 ? out : undefined;
  },
} as const;
