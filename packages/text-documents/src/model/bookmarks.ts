// Bookmarks (docs/specs/034-text-documents/links-and-navigation.md "Bookmarks", "Heading links"): a named point in the
// writing. A name both formats accept is made for a new one; a hidden one (its name starting with `_`, as Word and
// Google hide theirs) is one too, never shown: the first at a heading's start is the heading's id.
import type { KeptProperties, TextProps } from './props';

export type Bookmark = {
  readonly type: 'bookmark';
  readonly name: string;
  /** The formatting of the run it sat in (ODF writes it inside its span). */
  readonly props: TextProps;
  readonly style?: string;
  readonly link?: string;
  readonly kept?: KeptProperties;
};

/** A new bookmark's name: this many lowercase letters and digits, the first a letter. */
export const BOOKMARK_NAME_LENGTH = 12;
/** What starts a hidden name, a heading's id among them. */
export const HIDDEN_BOOKMARK_PREFIX = '_';
/** The longest name the model holds (Word's limit, 40 characters). */
export const BOOKMARK_NAME_MAX = 40;

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

export const Bookmarks = {
  /** Whether a file's bookmark name is one the model holds: a name past its hidden mark, no longer than Word allows. */
  held: (name: string): boolean =>
    name.replace(HIDDEN_BOOKMARK_PREFIX, '').length > 0 &&
    name.length <= BOOKMARK_NAME_MAX &&
    !/\s/.test(name),

  /** Whether a name is hidden: never shown, as Word and Google hide a heading's. */
  hidden: (name: string): boolean => name.startsWith(HIDDEN_BOOKMARK_PREFIX),

  /** A new name from `random` (0 to 1), never one of `taken`. */
  newName: (taken: ReadonlySet<string>, random: () => number = Math.random): string => {
    const pick = (from: string) => from[Math.floor(random() * from.length) % from.length]!;
    for (;;) {
      let name = pick(LETTERS);
      while (name.length < BOOKMARK_NAME_LENGTH) name += pick(LETTERS + DIGITS);
      if (!taken.has(name)) return name;
    }
  },

  /** A new heading id, as Google names one in a Word file: the hidden mark and a new name, never one of `taken`. */
  newHeadingId: (taken: ReadonlySet<string>, random: () => number = Math.random): string => {
    for (;;) {
      const id = `${HIDDEN_BOOKMARK_PREFIX}${Bookmarks.newName(new Set(), random)}`;
      if (!taken.has(id)) return id;
    }
  },
} as const;
