// Rows of a sheet by position, as a spreadsheet loads them (docs/specs/029-sheets/sheet-store.md "In a spreadsheet",
// Loading by viewport): the rows in view first, the rest in pages behind. A span is half-open, `<from>-<to>` on the
// wire, over the sheet's row order at the rev it is read at.

// The rows a spreadsheet opens on: a tall screen and a screen around it. 50 to 1,000.
export const WORKBOOK_FIRST_ROWS = 200;
// The rows of one page streamed behind (blueprint 5c): at 26 filled columns about 130,000 cells. 1,000 to 20,000.
export const SHEET_PAGE_ROWS = 5_000;

export type RowSpan = { readonly from: number; readonly to: number };

const SPAN = /^(\d{1,9})-(\d{1,9})$/;

export const RowSpan = {
  /** A span as asked on the wire, or null for one that is not `<from>-<to>`, runs backwards or passes a page. */
  read: (text: string | null): RowSpan | null => {
    const m = text === null ? null : SPAN.exec(text);
    if (!m) return null;
    const from = Number(m[1]);
    const to = Number(m[2]);
    if (to < from || to - from > SHEET_PAGE_ROWS) return null;
    return { from, to };
  },
  text: (span: RowSpan): string => `${span.from}-${span.to}`,
  /** The span inside a sheet of `rows` rows. */
  clamp: (span: RowSpan, rows: number): RowSpan => ({
    from: Math.min(span.from, rows),
    to: Math.min(span.to, rows),
  }),
  /** The next page of a sheet of `rows` rows, from row `from`. */
  page: (from: number, rows: number): RowSpan => ({
    from,
    to: Math.min(from + SHEET_PAGE_ROWS, rows),
  }),
  first: (): RowSpan => ({ from: 0, to: WORKBOOK_FIRST_ROWS }),
} as const;
