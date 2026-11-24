// A page's text as the file orders it (docs/specs/035-pdf-documents/opening.md "What is read": Text): the characters,
// each with its box on the page, for selection, find, copy, search and the accessible tree. Text is text: a string
// and numbers, never markup.

export type PageText = {
  /** The characters in the file's own order. */
  readonly text: string;
  /**
   * A box for every unit of `text`, four numbers each, in page space: left, bottom, right, top. A character the
   * reader adds itself (the break at a line's end) has an empty box.
   */
  readonly boxes: Float32Array;
  /** Where in `text` a font mapped no character: what shows there is a guess. */
  readonly unmapped: readonly number[];
  /** Whether the page holds more text than was read (`PDF_PAGE_TEXT_MAX_CHARS`). */
  readonly cut: boolean;
  /**
   * For every unit of `text`, the marked content its character is drawn in: its id, `PageText.UNMARKED` or
   * `PageText.ARTIFACT`. Null where the file is untagged.
   */
  readonly marked: Int32Array | null;
};

export type TextBox = {
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly top: number;
};

const REPLACEMENT = '\uFFFD';

const characterOf = (code: number): string =>
  code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
    ? String.fromCodePoint(code)
    : REPLACEMENT;

export const PageText = {
  /**
   * The text of characters as a reader hands them over: one code point each, four numbers of box each. `unmapped`
   * counts in characters, and is answered in units of the text.
   */
  of: (
    codes: ArrayLike<number>,
    boxes: ArrayLike<number>,
    {
      unmapped = [],
      cut = false,
      marked = null,
    }: { unmapped?: readonly number[]; cut?: boolean; marked?: ArrayLike<number> | null } = {},
  ): PageText => {
    const parts: string[] = [];
    const starts: number[] = [];
    let units = 0;
    for (let at = 0; at < codes.length; at += 1) {
      const character = characterOf(codes[at]!);
      parts.push(character);
      starts.push(units);
      units += character.length;
    }
    const spread = new Float32Array(units * 4);
    for (let at = 0; at < codes.length; at += 1) {
      for (let unit = starts[at]!; unit < starts[at]! + parts[at]!.length; unit += 1) {
        for (let side = 0; side < 4; side += 1) spread[unit * 4 + side] = boxes[at * 4 + side] ?? 0;
      }
    }
    const marks = marked ? new Int32Array(units) : null;
    if (marks && marked) {
      for (let at = 0; at < codes.length; at += 1) {
        marks.fill(marked[at]!, starts[at], starts[at]! + parts[at]!.length);
      }
    }
    return {
      text: parts.join(''),
      boxes: spread,
      unmapped: unmapped.flatMap((at) => (at < starts.length ? [starts[at]!] : [])),
      cut,
      marked: marks,
    };
  },
  /** A unit drawn in no marked content, or the reader's own. */
  UNMARKED: -1,
  /** A unit drawn as an artifact: a page number, a running header, nothing the page's content reads. */
  ARTIFACT: -2,
  /** The box of the unit at `index` of the text, or null past its end. */
  boxAt: (page: PageText, index: number): TextBox | null => {
    if (!Number.isInteger(index) || index < 0 || index >= page.text.length) return null;
    const [left, bottom, right, top] = page.boxes.subarray(index * 4, index * 4 + 4);
    return { left: left!, bottom: bottom!, right: right!, top: top! };
  },
} as const;
