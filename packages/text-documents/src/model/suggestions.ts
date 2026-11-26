// Suggestions in the model (docs/specs/034-text-documents/review.md "How a suggestion is kept", "In the files"): each
// inline and paragraph carries the suggestions it is part of, as the live state's marks do, so the files' tracked
// changes and the live marks map one to one. A file's suggestion has the file's name for its author and no key.
import type { Block, Inline, Paragraph } from './blocks';
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

/** A whole block's suggestion: a table, a section break or a table of contents inserted or deleted. */
export type BlockSuggested = {
  readonly insertion?: FileSuggestionMark;
  readonly deletion?: FileSuggestionMark;
};

/** The kinds a whole block is suggested in. */
export type BlockSuggestionKind = keyof BlockSuggested;

/** What a suggested table's rows or a table of contents' entries were found to be: its kind and each group's first mark. */
export type TrackedGroups = {
  readonly kind: BlockSuggestionKind;
  readonly marks: readonly FileSuggestionMark[];
};

/**
 * What an empty paragraph of a suggested row or table of contents holds in ODF, so the row has writing to mark, as
 * LibreOffice writes one (standard-mapping.md "Suggested blocks").
 */
export const SUGGESTED_EMPTY_JOINER = '\u200d';

/** An inline whose suggestions mark writing: anything but a comment's edge and a bookmark. */
const marksWriting = (i: Inline): boolean => i.type !== 'comment' && i.type !== 'bookmark';

const BREAK_OF = { insertion: 'break', deletion: 'join' } as const;

/** Whether `mark` is part of a block's suggestion `marks`: one of their ids, or a file's of the first one's author. */
const partOf = (mark: FileSuggestionMark, marks: readonly FileSuggestionMark[]): boolean =>
  marks.some((m) => m.id === mark.id) ||
  (mark.author.key === undefined &&
    marks[0]?.author.key === undefined &&
    mark.author.name === marks[0]?.author.name);

/** Whether two runs are the same but for their text. */
const sameRunBut = (a: Inline, b: Inline): boolean => {
  if (a.type !== 'run' || b.type !== 'run') return false;
  const { text: _a, ...restA } = a;
  const { text: _b, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
};

/** An inline without its mark of `kind`. */
function withoutMark(inline: Inline, kind: BlockSuggestionKind): Inline {
  if (inline.type === 'comment' || !inline.suggested) return inline;
  const { [kind]: _, ...rest } = inline.suggested;
  const { suggested: __, ...plain } = inline;
  return Object.keys(rest).length > 0 ? { ...plain, suggested: rest } : plain;
}

/** The paragraph with the marks of `kind` part of `marks` dropped, joiners taken out of them and equal runs joined. */
function absorbedParagraph(
  paragraph: Paragraph,
  kind: BlockSuggestionKind,
  marks: readonly FileSuggestionMark[],
): Paragraph {
  const inlines: Inline[] = [];
  for (const inline of paragraph.inlines) {
    const mark = inline.type === 'comment' ? undefined : inline.suggested?.[kind];
    let next = inline;
    if (mark && partOf(mark, marks)) {
      next = withoutMark(inline, kind);
      if (next.type === 'run') {
        const text = next.text.replaceAll(SUGGESTED_EMPTY_JOINER, '');
        if (text === '') continue;
        next = { ...next, text };
      }
    }
    const last = inlines[inlines.length - 1];
    if (last?.type === 'run' && next.type === 'run' && sameRunBut(last, next))
      inlines[inlines.length - 1] = { ...last, text: last.text + next.text };
    else inlines.push(next);
  }
  const { suggested: held, ...rest } = paragraph;
  const own = held?.[BREAK_OF[kind]];
  let suggested = held;
  if (held && own && partOf(own, marks)) {
    const { [BREAK_OF[kind]]: _, ...left } = held;
    suggested = Object.keys(left).length > 0 ? left : undefined;
  }
  return { ...rest, inlines, ...(suggested ? { suggested } : {}) };
}

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
  /** Every suggestion mark the blocks hold: whole blocks', and those in table cells, contents' entries and notes. */
  marks: (blocks: readonly Block[]): FileSuggestionMark[] => [
    ...Blocks.tables(blocks).flatMap((t) => Object.values(t.suggested ?? {})),
    ...blocks.flatMap((b) =>
      b.type === 'section'
        ? Object.values(b.suggested ?? {})
        : b.type === 'contents'
          ? [...Object.values(b.suggested ?? {}), ...Suggestions.marks(b.entries)]
          : [],
    ),
    ...Blocks.paragraphs(blocks).flatMap((p) => [
      ...Object.values(p.suggested ?? {}),
      ...p.inlines.flatMap((i) => [
        ...(i.type === 'comment' ? [] : Object.values(i.suggested ?? {})),
        ...(i.type === 'note' ? Suggestions.marks(i.blocks) : []),
      ]),
    ]),
  ],
  /**
   * The blocks with every mark of `kind` that is part of a whole block's suggestion (`marks`: an id of theirs, or a
   * file's of the first one's author) dropped, in tables at any depth too, and the joiners taken out of what they
   * marked: what is inside a suggested block carries only its own suggestions (standard-mapping.md "Suggested blocks").
   */
  absorbed: (
    blocks: readonly Block[],
    kind: BlockSuggestionKind,
    marks: readonly FileSuggestionMark[],
  ): Block[] =>
    blocks.map((b) =>
      b.type === 'paragraph'
        ? absorbedParagraph(b, kind, marks)
        : b.type === 'table'
          ? {
              ...b,
              rows: b.rows.map((row) => ({
                ...row,
                cells: row.cells.map((cell) => ({
                  ...cell,
                  blocks: Suggestions.absorbed(cell.blocks, kind, marks),
                })),
              })),
            }
          : b,
    ),
  /**
   * The blocks with `mark` laid under every inline that marks writing as its `kind`, in tables at any depth too, each
   * inline's own mark of that kind kept over it: a suggested block's content as Word writes it (standard-mapping.md
   * "Suggested blocks").
   */
  overlaid: (
    blocks: readonly Block[],
    kind: BlockSuggestionKind,
    mark: FileSuggestionMark,
  ): Block[] =>
    blocks.map((b) =>
      b.type === 'paragraph'
        ? {
            ...b,
            inlines: b.inlines.map((i) =>
              marksWriting(i) && i.type !== 'comment'
                ? { ...i, suggested: { [kind]: mark, ...i.suggested } }
                : i,
            ),
          }
        : b.type === 'table'
          ? {
              ...b,
              rows: b.rows.map((row) => ({
                ...row,
                cells: row.cells.map((cell) => ({
                  ...cell,
                  blocks: Suggestions.overlaid(cell.blocks, kind, mark),
                })),
              })),
            }
          : b,
    ),
  /** A whole block's suggestion as its kind and mark; undefined for none. */
  ofBlock: (
    suggested: BlockSuggested | undefined,
  ): { kind: BlockSuggestionKind; mark: FileSuggestionMark } | undefined =>
    suggested?.insertion
      ? { kind: 'insertion', mark: suggested.insertion }
      : suggested?.deletion
        ? { kind: 'deletion', mark: suggested.deletion }
        : undefined,
  /**
   * Whether every group (each row's paragraphs, or a table of contents' entries as one) holds writing, all of it in
   * suggestions of one kind, as LibreOffice reads a tracked row: that kind and each group's first mark. A file
   * LiveDoc wrote asks more: each group's first mark must be a whole block's (`isBlockMark`).
   */
  tracked: (
    groups: readonly (readonly Paragraph[])[],
    isBlockMark: (mark: FileSuggestionMark) => boolean = () => true,
  ): TrackedGroups | undefined => {
    let kind: BlockSuggestionKind | undefined;
    const marks: FileSuggestionMark[] = [];
    for (const group of groups) {
      const writing = group.flatMap((p) => p.inlines.filter(marksWriting));
      const first = writing[0]?.type === 'comment' ? undefined : writing[0]?.suggested;
      const own = first?.insertion ? 'insertion' : first?.deletion ? 'deletion' : undefined;
      if (!own || (kind && own !== kind)) return undefined;
      if (!writing.every((i) => i.type !== 'comment' && i.suggested?.[own])) return undefined;
      const mark = first![own]!;
      if (!isBlockMark(mark)) return undefined;
      kind = own;
      marks.push(mark);
    }
    return kind ? { kind, marks } : undefined;
  },
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
