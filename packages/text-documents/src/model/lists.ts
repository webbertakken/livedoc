// Lists (docs/specs/034-text-documents/lists.md): a list is a definition of nine levels; a paragraph is in a list by
// its id, at a level, and paragraphs of one list number on across anything between them.
import type { KeptProperties } from './props';

export const LIST_LEVELS = 9;

export const NUMBER_FORMATS = [
  'decimal',
  'lower-letter',
  'upper-letter',
  'lower-roman',
  'upper-roman',
] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export type ListLevel =
  | {
      readonly kind: 'bullet';
      readonly bullet: string;
      readonly indent?: number;
      readonly hanging?: number;
    }
  | { readonly kind: 'check'; readonly indent?: number; readonly hanging?: number }
  | {
      readonly kind: 'number';
      readonly format: NumberFormat;
      /** The label: `%1` to `%9` stand for the numbers of levels 1 to 9 (`%1.%2.`). */
      readonly label: string;
      readonly start: number;
      readonly indent?: number;
      readonly hanging?: number;
    };

export type ListDefinition = {
  readonly levels: readonly ListLevel[];
  readonly kept?: KeptProperties;
};

/** A paragraph's place in a list. */
export type ListPlace = {
  readonly id: string;
  /** 0 to 8. */
  readonly level: number;
  readonly checked?: boolean;
  /** Numbering starts again here, at this number. */
  readonly restart?: number;
  /** A further paragraph of the item above, without a marker of its own. */
  readonly unnumbered?: boolean;
};

/** The checklist's marks, as ODF files carry a checklist item without an element of its own. */
export const CHECK_MARKS = { open: '☐', done: '☑' } as const;

const indentOf = (level: number) => ({ indent: 36 * (level + 1), hanging: 18 });

const BULLETS = ['●', '○', '■'];
const FORMATS: NumberFormat[] = ['decimal', 'lower-letter', 'lower-roman'];

export const ListDefinition = {
  /** Google's default list of a kind: ●○■ bullets, 1. a. i. numbers, or checkboxes, indented 0.5 in a level. */
  of: (kind: 'bullet' | 'number' | 'check'): ListDefinition => ({
    levels: Array.from({ length: LIST_LEVELS }, (_, level): ListLevel => {
      if (kind === 'bullet') return { kind, bullet: BULLETS[level % 3]!, ...indentOf(level) };
      if (kind === 'check') return { kind, ...indentOf(level) };
      return {
        kind,
        format: FORMATS[level % 3]!,
        label: `%${level + 1}.`,
        start: 1,
        ...indentOf(level),
      };
    }),
  }),
  /** An id no list in `existing` has: `L<n>`, past the highest such number there. */
  newId: (existing: Iterable<string>): string => {
    let high = 0;
    for (const id of existing) {
      const n = /^L(\d+)$/.exec(id)?.[1];
      if (n) high = Math.max(high, Number(n));
    }
    return `L${high + 1}`;
  },
  /** The kind of a list at a level. */
  kindAt: (list: ListDefinition | undefined, level: number): ListLevel['kind'] =>
    list?.levels[level]?.kind ?? 'bullet',
} as const;
