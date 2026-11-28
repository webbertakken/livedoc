// @vitest-environment jsdom
// The visible cells (docs/specs/029-sheets/sheet.md "The grid"): values drawn with their formats, aligned by kind,
// errors in red; text running over empty neighbours; numbers too wide showing fewer decimals, then scientific, then
// ####; merges, hidden lines and the frozen panes.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Workbook,
  WorkbookCopy,
  cellKey,
  cellLines,
  cellTurn,
  rowHeights,
  parseA1,
  readTypedInput,
  type CellFormat,
  type Sheet,
  type SheetLayout,
  CellMap,
} from '@livedoc/sheets';
import { planPalette } from '@/components/plan/plan-palette';
import { SheetCells, fitNumber, fontPx, roughWidth } from './SheetCells';
import { geometryOf, visibleWindow, type Geometry } from './sheet-geometry';
import { SheetImageLoader } from './sheet-image-loader';
import { SheetImagesContext } from './sheet-images-context';

const palette = planPalette('light');
const RED = 'rgb(220, 38, 38)';

function grid(rows: number, cols: number, extra: Partial<SheetLayout> = {}): SheetLayout {
  return {
    rows: Array.from({ length: rows }, (_, i) => `r${i}`),
    cols: Array.from({ length: cols }, (_, i) => `c${i}`),
    ...extra,
    // Fixed sizes (100 x 24), so the arithmetic below tests the geometry, not the engine's defaults.
    rowSize: {
      ...Object.fromEntries(Array.from({ length: rows }, (_, i) => [`r${i}`, 24])),
      ...extra.rowSize,
    },
    colSize: {
      ...Object.fromEntries(Array.from({ length: cols }, (_, i) => [`c${i}`, 100])),
      ...extra.colSize,
    },
  };
}

// The grid with no row sized: every row automatic, at least 28 px (sheet.md "Row height").
const automatic = (): SheetLayout => ({ ...grid(10, 6), rowSize: {} });

// A sheet typed in as a person would (A1 -> text), with formats by A1.
function sheetOf(
  cells: Record<string, string>,
  formats: Record<string, CellFormat> = {},
  layout: SheetLayout = grid(10, 6),
) {
  const sheet: Sheet = {
    id: 's1',
    tabId: 't1',
    title: 'Sheet 1',
    layout,
    cells: new CellMap(),
    rev: 0,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: { id: '', name: '', color: '#000000' },
  };
  const typing = new Workbook({ sheets: [sheet], locale: 'en-GB' });
  const key = (a1: string) => {
    const p = parseA1(a1)!;
    return cellKey(layout.rows[p.r]!, layout.cols[p.c]!);
  };
  for (const [a1, text] of Object.entries(cells)) {
    const read = readTypedInput(text, 'en-GB', typing.ctxFor(sheet.id));
    if (read.kind !== 'value') throw new Error(`${a1}: ${text}`);
    sheet.cells.set(key(a1), {
      input: read.input,
      ...(read.hint ? { format: { nf: read.hint.nf } } : {}),
    });
  }
  for (const [a1, f] of Object.entries(formats)) {
    const before = sheet.cells.get(key(a1));
    sheet.cells.set(key(a1), { ...before, format: { ...before?.format, ...f } });
  }
  return { sheet, workbook: new Workbook({ sheets: [sheet], locale: 'en-GB' }) };
}

function draw(
  { sheet, workbook }: ReturnType<typeof sheetOf>,
  opts: {
    scroll?: { top: number; left: number };
    view?: { width: number; height: number };
    fontFamily?: string;
    filterHead?: { r: number; cols: ReadonlySet<number> };
    geometry?: Geometry;
    showFormulas?: boolean;
  } = {},
) {
  const geometry = opts.geometry ?? geometryOf(sheet.layout);
  const scroll = opts.scroll ?? { top: 0, left: 0 };
  return render(
    <SheetCells
      sheet={sheet}
      workbook={workbook}
      version={0}
      geometry={geometry}
      window={visibleWindow(geometry, scroll, opts.view ?? { width: 800, height: 400 })}
      scroll={scroll}
      palette={palette}
      locale="en-GB"
      fontFamily={opts.fontFamily}
      filterHead={opts.filterHead}
      showFormulas={opts.showFormulas}
    />,
  );
}

const textBox = (text: string) => screen.getByText<HTMLElement>(text);

describe('the helpers', () => {
  it('sizes fonts from the point size, else the base', () => {
    expect(fontPx(undefined)).toBe(13);
    expect(fontPx({ fs: 12 })).toBe(16);
  });

  it('measures digits and spaces narrower than letters', () => {
    expect(roughWidth('ab 1', 10)).toBeCloseTo(20.3);
  });

  // sheet.md "The grid": whether a number fits is measured from its font's widths, its digits tabular as drawn.
  it('measures a number as drawn, in tabular figures, so it shortens before it reaches the edge', () => {
    // 88888888.88 is 88 px in Inter's tabular figures, past the 80 px a 88 px column leaves: a guess of half an
    // em a digit would let it run over.
    expect(fitNumber('88888888.88', 88888888.88, undefined, 88, 13)).toBe('88888888.9');
    expect(fitNumber('88888888.88', 88888888.88, undefined, 97, 13)).toBe('88888888.88');
    // In a font with narrower figures it fits; bold Caveat has no tabular figures and keeps its own.
    expect(fitNumber('88888888.88', 88888888.88, undefined, 88, 13, 'caveat')).toBe('88888888.88');
    expect(fitNumber('88888888.88', 88888888.88, { ff: 'nunito' }, 88, 13, 'caveat')).toBe(
      '88888888.9',
    );
  });

  it('keeps a number that fits, else fewer digits, then scientific, then ####', () => {
    expect(fitNumber('42', 42, undefined, 100, 13)).toBe('42');
    // 3.14159 is 54 px in tabular figures, past the 52 px of room: one digit fewer.
    expect(fitNumber(String(Math.PI), Math.PI, undefined, 60, 13)).toBe('3.1416');
    expect(fitNumber(String(Math.PI), Math.PI, undefined, 64, 13)).toBe('3.14159');
    expect(fitNumber('123456789012', 123456789012, undefined, 70, 13)).toBe('1.2E+11');
    expect(fitNumber('123456789012', 123456789012, undefined, 50, 13)).toBe('#####');
    expect(fitNumber('0.000000000001234', 1.234e-12, { nf: 'auto' }, 70, 13)).toBe('1.23E-12');
    // A chosen number format is never rounded to fit: ####.
    expect(fitNumber('1,234,567.00', 1234567, { nf: 'number' }, 50, 13)).toMatch(/^#+$/);
  });
});

// grid-and-editing.md "Formulas" (D141): Show › Formulas draws each formula as typed, other cells as before.
describe('Show › Formulas', () => {
  it('draws a formula cell’s formula, left-aligned, and leaves the rest', () => {
    const sheet = sheetOf({ A1: '2', A2: '=A1*3' });
    const { unmount } = draw(sheet);
    expect(textBox('6')).toBeTruthy();
    unmount();
    draw(sheet, { showFormulas: true });
    expect(screen.queryByText('6')).toBeNull();
    expect(textBox('=A1*3').style.textAlign).toBe('left');
    expect(textBox('2').style.textAlign).toBe('right');
    // A HYPERLINK shows its formula, never drawn as a link.
    const linked = sheetOf({ A1: '=HYPERLINK("https://example.com", "Site")' });
    draw(linked, { showFormulas: true });
    const link = textBox('=HYPERLINK("https://example.com", "Site")');
    expect(link.style.textDecoration).toBe('');
  });
});

describe('the cells', () => {
  it('keeps room at the right of a filter header cell for its button, and of no other cell', () => {
    draw(sheetOf({ A1: 'Planned', B1: 'Actual', A2: '12' }), {
      filterHead: { r: 0, cols: new Set([0]) },
    });
    expect(textBox('Planned').style.paddingRight).toBe('20px');
    expect(textBox('Actual').style.paddingRight).toBe('');
    expect(textBox('12').style.paddingRight).toBe('');
  });

  it('aligns text left, numbers right and booleans and errors centred, errors in red', () => {
    draw(sheetOf({ A1: 'hello', B1: '42', C1: 'TRUE', D1: '=1/0' }));
    expect(textBox('hello').style.justifyContent).toBe('flex-start');
    expect(textBox('42').style.justifyContent).toBe('flex-end');
    expect(textBox('TRUE').style.justifyContent).toBe('center');
    const err = textBox('#DIV/0!');
    expect(err.style.justifyContent).toBe('center');
    expect(err.style.color).toBe(RED);
  });

  it('draws a cell’s format: weight, style, decoration, colours, size and alignment', () => {
    draw(
      sheetOf(
        { A1: 'styled', A2: 'top', A3: 'mid', A4: 'wrapped' },
        {
          A1: {
            b: true,
            i: true,
            u: true,
            st: true,
            fc: '#ff0000',
            bg: '#00ff00',
            fs: 12,
            ha: 'c',
          },
          A2: { va: 't' },
          A3: { va: 'm', ha: 'r' },
          A4: { wr: 'w' },
        },
      ),
    );
    const s = textBox('styled').style;
    expect(s.fontWeight).toBe('700');
    expect(s.fontStyle).toBe('italic');
    expect(s.textDecoration).toBe('underline line-through');
    // Red falls short on lime: drawn deepened until it reads at AA (sheet.md "Readable cells").
    expect(s.color).toBe('rgb(179, 0, 0)');
    expect(s.fontSize).toBe('16px');
    expect(s.justifyContent).toBe('center');
    const bg = [...document.querySelectorAll<HTMLElement>('div')].find(
      (el) => el.style.backgroundColor === 'rgb(0, 255, 0)',
    );
    expect(bg).toBeTruthy();
    expect(textBox('top').style.alignItems).toBe('flex-start');
    expect(textBox('mid').style.alignItems).toBe('center');
    expect(textBox('mid').style.justifyContent).toBe('flex-end');
    // A cell that wraps is drawn on the lines the engine broke it into: the browser wraps nothing itself.
    expect(textBox('wrapped').className).toContain('whitespace-pre');
    expect(textBox('wrapped').className).not.toContain('pre-wrap');
  });

  // formatting.md "Themes": a theme colour draws in the workbook's theme.
  it('draws a theme colour in the workbook’s theme', () => {
    const book = sheetOf({ A1: 'themed' }, { A1: { bg: 'theme:accent1' } });
    book.workbook.setTheme({
      ...book.workbook.theme,
      colours: { ...book.workbook.theme.colours, accent1: '#00ff00' },
    });
    draw(book);
    const fills = [...document.querySelectorAll<HTMLElement>('div')].map(
      (el) => el.style.backgroundColor,
    );
    expect(fills).toContain('rgb(0, 255, 0)');
  });

  // formatting.md "Alternating colours" (D216): a banding fills under a cell's own fill.
  it("shades alternating colours under a cell's own fill", () => {
    const book = sheetOf(
      { A1: 'head', A2: 'one', A3: 'two', A4: 'own' },
      { A4: { bg: '#00ff00' } },
    );
    book.sheet.layout.bands = [
      {
        id: 'band01',
        r1: 'r0',
        c1: 'c0',
        r2: 'r3',
        c2: 'c0',
        head: '#ff0000',
        band1: '#0000ff',
        band2: '#ffff00',
        foot: '#000000',
        header: true,
      },
    ];
    book.workbook.updateSheet(book.sheet);
    draw(book);
    const fills = [...document.querySelectorAll<HTMLElement>('div')].map(
      (el) => el.style.backgroundColor,
    );
    for (const colour of ['rgb(255, 0, 0)', 'rgb(0, 0, 255)', 'rgb(255, 255, 0)', 'rgb(0, 255, 0)'])
      expect(fills).toContain(colour);
  });

  // docs/specs/029-sheets/sheet.md "Row height": the grid draws exactly the lines that were measured.
  it('draws a wrapping cell on the lines its row was sized by, in a row as tall as they need', () => {
    const text = 'Rows grow to fit the text their cells hold, so nobody sizes them by hand';
    const made = sheetOf(
      { A1: text, A2: 'one\ntwo', A3: 'plain' },
      { A1: { wr: 'w' } },
      automatic(),
    );
    const heightOf = rowHeights(made.workbook, made.sheet.id);
    const lines = cellLines(made.workbook, made.sheet.id, 0, 0, text);
    expect(lines.length).toBeGreaterThan(2);
    draw(made, { geometry: geometryOf(made.sheet.layout, new Set(), heightOf) });
    const boxes = [...document.querySelectorAll<HTMLElement>('[data-sheet-text]')];
    const [wrapped, broken, plain] = boxes;
    expect(wrapped!.textContent).toBe(lines.join('\n'));
    expect(wrapped!.style.height).toBe(`${lines.length * 17 + 8}px`);
    expect(wrapped!.style.lineHeight).toBe('17px');
    expect(broken!.textContent).toBe('one\ntwo');
    expect(broken!.style.height).toBe(`${2 * 17 + 8}px`);
    expect(plain!.style.height).toBe('28px');
    // Measured lines are placed by the font's own widths, never snapped to whole px: a browser that snaps draws
    // them wider than they were measured.
    expect(wrapped!.style.textRendering).toBe('geometricprecision');
    expect(broken!.style.textRendering).toBe('geometricprecision');
    expect(plain!.style.textRendering).toBe('');
  });

  // formatting.md "Alignment, wrapping, rotation": turned text in the box it turns to, in a row as tall as it needs.
  it("turns a cell's text counterclockwise in its turned box, and stacks one upright", () => {
    const made = sheetOf(
      {
        A1: 'Quarter',
        A2: 'Down',
        A3: 'Top',
        A4: '12345678901234',
        A5: 'Quarterly results so far',
        A6: 'Short row',
      },
      {
        A1: { ro: 90, va: 'b' },
        A2: { ro: -45 },
        A3: { ro: 'v', va: 'b' },
        A4: { ro: 90 },
        A5: { ro: 45 },
        A6: { ro: 90, va: 'b' },
      },
      { ...automatic(), rowSize: { r5: 24 } },
    );
    const heightOf = rowHeights(made.workbook, made.sheet.id);
    draw(made, { geometry: geometryOf(made.sheet.layout, new Set(), heightOf) });
    const up = document.querySelector<HTMLElement>('[data-sheet-turned="90"]')!;
    const turn = cellTurn(made.workbook, made.sheet.id, 0, 0, 'Quarter')!;
    expect(up.style.width).toBe(`${turn.w}px`);
    expect(up.style.height).toBe(`${turn.h}px`);
    expect((up.firstChild as HTMLElement).style.transform).toBe(
      'translate(-50%, -50%) rotate(-90deg)',
    );
    expect(textBox('Down').style.transform).toContain('rotate(45deg)');
    // Bottom-aligned, 3 px up where the row has that to spare over the turned box, as upright text.
    expect(up.parentElement!.style.paddingBottom).toBe('3px');
    expect(textBox('Short row').parentElement!.parentElement!.style.paddingBottom).toBe('0px');
    // Stacked: upright, a character a line, its row a line each.
    const stacked = document.querySelectorAll<HTMLElement>('[data-sheet-text]')[2]!;
    expect(stacked.textContent).toBe('T\no\np');
    expect(stacked.style.height).toBe(`${3 * 17 + 8}px`);
    expect(stacked.style.paddingBottom).toBe('3px');
    // A turned number keeps all its digits; turned text runs over empty neighbours by the width it turns to.
    expect(textBox('12345678901234')).toBeTruthy();
    const tilted = cellTurn(made.workbook, made.sheet.id, 4, 0, 'Quarterly results so far')!;
    expect(tilted.w).toBeGreaterThan(100);
    expect(
      Number.parseFloat(
        textBox('Quarterly results so far').parentElement!.parentElement!.style.width,
      ),
    ).toBeGreaterThan(100);
  });

  it('keeps bottom-aligned text 3 px up only where its row has that to spare', () => {
    const made = sheetOf(
      { A1: 'big', A2: 'small' },
      { A1: { fs: 18, va: 'b' }, A2: { va: 'b' } },
      automatic(),
    );
    const heightOf = rowHeights(made.workbook, made.sheet.id);
    draw(made, { geometry: geometryOf(made.sheet.layout, new Set(), heightOf) });
    // 18 points is a 31 px line in a 32 px row: 1 px to spare.
    expect(textBox('big').style.paddingBottom).toBe('1px');
    expect(textBox('small').style.paddingBottom).toBe('3px');
  });

  it('draws a number format', () => {
    draw(sheetOf({ A1: '3' }, { A1: { nf: 'number', dp: 2 } }));
    expect(screen.getByText('3.00')).toBeTruthy();
  });

  it('draws borders over the cell', () => {
    const { container } = draw(sheetOf({}, { B2: { bt: { w: 2, s: 'dashed', c: '#123456' } } }));
    const border = [...container.querySelectorAll<HTMLElement>('div')].find((el) =>
      el.style.borderTop.includes('dashed'),
    )!;
    expect(border.style.borderTop).toBe('2px dashed rgb(18, 52, 86)');
    expect([border.style.left, border.style.top]).toEqual(['99px', '23px']);
  });

  // formatting.md "Borders": a double is three pixels drawn as two lines, whatever width it came with.
  it('draws a double border at three pixels', () => {
    const { container } = draw(sheetOf({}, { B2: { bb: { w: 1, s: 'double', c: '#000000' } } }));
    const border = [...container.querySelectorAll<HTMLElement>('div')].find((el) =>
      el.style.borderBottom.includes('double'),
    )!;
    expect(border.style.borderBottom).toBe('3px double rgb(0, 0, 0)');
  });

  it('runs left-aligned text over empty neighbours, stopping at a filled one', () => {
    const long = 'a fairly long run of words that spills';
    draw(sheetOf({ A1: long, A2: long, B2: 'x' }));
    const [first, second] = screen.getAllByText(long);
    expect(Number.parseFloat(first!.style.width)).toBeGreaterThan(100);
    expect(first!.className).not.toContain('overflow-hidden');
    expect(second!.style.width).toBe('100px');
    expect(second!.className).toContain('overflow-hidden');
  });

  it('never runs a number, right-aligned text or clipped text over its neighbours', () => {
    const long = 'a fairly long run of words that spills';
    draw(sheetOf({ A1: long, A2: long }, { A1: { ha: 'r' }, A2: { wr: 'c' } }));
    for (const el of screen.getAllByText(long)) expect(el.style.width).toBe('100px');
  });

  it('skips hidden columns when running over, and stops at a merge', () => {
    const long = 'a fairly long run of words that spills over plenty of columns indeed';
    draw(
      sheetOf(
        { A1: long, A2: long },
        {},
        grid(10, 6, { hiddenCols: ['c1'], merges: [{ r1: 'r1', c1: 'c1', r2: 'r1', c2: 'c2' }] }),
      ),
    );
    const [first, second] = screen.getAllByText(long);
    expect(Number.parseFloat(first!.style.width)).toBeGreaterThan(100);
    expect(second!.style.width).toBe('100px');
  });

  it('shows too wide a number in scientific form', () => {
    draw(sheetOf({ A1: '12345678901234' }));
    expect(screen.getByText('1.2E+13')).toBeTruthy();
  });

  it('draws a merge once, over its whole span', () => {
    const { container } = draw(
      sheetOf(
        { B2: 'merged' },
        {},
        grid(10, 6, { merges: [{ r1: 'r1', c1: 'c1', r2: 'r2', c2: 'c2' }] }),
      ),
    );
    const box = textBox('merged').style;
    expect([box.width, box.height]).toEqual(['200px', '48px']);
    // B2's merge stands for B2:C3: one cell box where four would be.
    const cellBoxes = container.querySelectorAll('.border-b.border-r');
    expect(cellBoxes).toHaveLength(10 * 6 - 3);
  });

  it('leaves out hidden rows and columns', () => {
    const { container } = draw(
      sheetOf(
        { A1: 'gone', B2: 'kept' },
        {},
        grid(4, 3, { hiddenRows: ['r0'], hiddenCols: ['c2'] }),
      ),
    );
    expect(screen.queryByText('gone')).toBeNull();
    expect(screen.getByText('kept')).toBeTruthy();
    expect(container.querySelectorAll('.border-b.border-r')).toHaveLength(3 * 2);
  });

  it('keeps frozen cells in place with a thicker edge line, however far it scrolls', () => {
    const layout = grid(200, 40, { frozenRows: 1, frozenCols: 1 });
    const { container } = draw(
      sheetOf({ A1: 'corner', B1: 'top', A2: 'side', Z150: 'far' }, {}, layout),
      {
        scroll: { top: 24 * 140, left: 100 * 20 },
        view: { width: 600, height: 300 },
      },
    );
    expect(textBox('corner').style.left).toBe('0px');
    expect(screen.queryByText('top')).toBeNull();
    expect(screen.queryByText('side')).toBeNull();
    expect(textBox('far')).toBeTruthy();
    const edges = [...container.querySelectorAll<HTMLElement>('div')].filter(
      (el) => el.style.zIndex === '3',
    );
    expect(edges).toHaveLength(2);
  });

  it('shows a value that is still loading as Loading…, left-aligned', () => {
    draw(sheetOf({ A1: '=CARDCOUNT()' }));
    expect(textBox('Loading…').style.justifyContent).toBe('flex-start');
  });

  // A pending value is an error underneath (#N/A, why "pending"): it is still drawn muted.
  it('draws a value that is still loading muted, not as an error', () => {
    draw(sheetOf({ A1: '=CARDCOUNT()' }));
    expect(textBox('Loading…').style.color).not.toBe(RED);
  });

  // sheet.md "The grid": numbers, dates and times in tabular figures, so a column of them lines up; text keeps its own.
  it('draws a number and a date in tabular figures, and text and errors in the font’s own', () => {
    draw(sheetOf({ A1: '1111.1', A2: '24/11/2026', A3: 'Total 11', A4: '=1/0' }));
    expect(textBox('1111.1').style.fontVariantNumeric).toBe('tabular-nums');
    expect(textBox('24/11/2026').style.fontVariantNumeric).toBe('tabular-nums');
    expect(textBox('Total 11').style.fontVariantNumeric).toBe('');
    expect(textBox('#DIV/0!').style.fontVariantNumeric).toBe('');
  });

  // docs/specs/029-sheets/sheet.md "Row height", D99: cells with no font are drawn in Inter, as they are measured.
  it('draws in Inter on a tab with no font', () => {
    const { container } = draw(sheetOf({}));
    // jsdom drops the quotes round a family name.
    expect((container.firstElementChild as HTMLElement).style.fontFamily).toMatch(
      /^"?Inter"?, ui-sans-serif, system-ui, sans-serif$/,
    );
  });

  it('uses the element’s font', () => {
    const { container } = draw(sheetOf({}), { fontFamily: 'Georgia' });
    expect((container.firstElementChild as HTMLElement).style.fontFamily).toBe('Georgia');
  });
});

// formulas.md "Recalculation": the page shows the Worker's values; one whose new value is on its way keeps its last,
// faded once the wait outlasts a moment.
describe('a value on its way from the engine', () => {
  it('keeps its last value, faded after a moment, and shows the new one plainly', () => {
    const { sheet } = sheetOf({ A1: '2', B1: '=A1*10' });
    const copy = new WorkbookCopy({ sheets: [sheet], locale: 'en-GB' });
    copy.acceptValue(sheet.id, 0, 1, 20);
    copy.markStale([{ sheetId: sheet.id, r: 0, c: 1 }]);
    const { rerender } = draw({ sheet, workbook: copy });
    const waiting = textBox('20');
    expect(waiting.hasAttribute('data-sheet-waiting')).toBe(true);
    expect(waiting.style.opacity).toBe('0.55');
    expect(waiting.style.transition).toBe('opacity 0s 120ms');
    copy.acceptValue(sheet.id, 0, 1, 30);
    rerender(
      <SheetCells
        sheet={sheet}
        workbook={copy}
        version={1}
        geometry={geometryOf(sheet.layout)}
        window={visibleWindow(
          geometryOf(sheet.layout),
          { top: 0, left: 0 },
          { width: 800, height: 400 },
        )}
        scroll={{ top: 0, left: 0 }}
        palette={palette}
        locale="en-GB"
      />,
    );
    expect(textBox('30').hasAttribute('data-sheet-waiting')).toBe(false);
    expect(textBox('30').style.opacity).toBe('');
  });
});

describe('IMAGE in the grid', () => {
  it('draws the picture where the spreadsheet fetches pictures, and nothing elsewhere', async () => {
    const book = sheetOf({ A1: '=IMAGE("https://a.example/a.png")' });
    const loader = new SheetImageLoader({
      fetch: async () => new Blob([new Uint8Array([1])], { type: 'image/png' }),
      objectUrl: () => 'blob:a',
      revoke: () => {},
    });
    const geometry = geometryOf(book.sheet.layout);
    const scroll = { top: 0, left: 0 };
    const cells = (
      <SheetCells
        sheet={book.sheet}
        workbook={book.workbook}
        version={0}
        geometry={geometry}
        window={visibleWindow(geometry, scroll, { width: 800, height: 400 })}
        scroll={scroll}
        palette={palette}
        locale="en-GB"
      />
    );
    const plain = render(cells);
    expect(screen.queryByRole('img')).toBeNull();
    plain.unmount();
    render(<SheetImagesContext.Provider value={loader}>{cells}</SheetImagesContext.Provider>);
    expect(
      await screen.findByRole('img', { name: 'Image from a.example', hidden: true }),
    ).toBeTruthy();
  });
});

// review.md "Notes": a noted cell draws a small black corner triangle, white on a dark fill, a note-only cell too.
describe('note markers', () => {
  it('draws a marker on each noted cell drawn, in ink readable on its fill', () => {
    const book = sheetOf({ A1: 'x' }, { B2: { bg: '#1e3a8a' } });
    const key = (r: number, c: number) =>
      cellKey(book.sheet.layout.rows[r]!, book.sheet.layout.cols[c]!);
    for (const [r, c] of [
      [0, 0],
      [1, 1],
      [2, 2],
    ] as const)
      book.sheet.cells.set(key(r, c), { ...book.sheet.cells.get(key(r, c)), note: 'n' });
    const { container } = draw(book);
    const markers = [...container.querySelectorAll<HTMLElement>('[data-sheet-note-marker]')];
    expect(markers.map((m) => [m.style.left, m.style.top, m.style.width])).toEqual([
      ['93px', '0px', '6px'],
      ['193px', '24px', '6px'],
      ['293px', '48px', '6px'],
    ]);
    expect(markers[0]!.getAttribute('style')).toContain('rgb(0, 0, 0) 50%');
    expect(markers[1]!.getAttribute('style')).toContain('rgb(255, 255, 255) 50%');
  });
});
