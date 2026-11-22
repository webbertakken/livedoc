// @vitest-environment jsdom
// docs/specs/034-text-documents/tables.md "Laying out across pages": a table's rows are its lines, rows joined by a
// cell spanning them one line, the page's edge drawn as a row across the table, and a table in a section of columns
// moving whole. jsdom draws nothing, so rows are drawn here by hand: each 30 px high, one under another.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Styles, type PageSetup } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '../text-document-schema';
import { PAGE_GAP_CLASS, measureBlock, rulesOf } from './pagination-measure';
import { cellGap, headerCopy, rowGap } from './pagination-draw';
import { paginationPlugin, relayoutPages } from './pagination-plugin';
import { lineStarts, tableRowOffset } from './pagination-tables';

const ROW = 30;
const formatting = { styles: Styles.builtIn('odf'), defaults: Styles.defaults() };

const cell = (text: string, rowspan = 1) =>
  schema.nodes.table_cell!.create(
    { rowspan },
    schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined),
  );
const row = (...cells: ReturnType<typeof cell>[]) => schema.nodes.table_row!.create(null, cells);
const table = (...rows: ReturnType<typeof row>[]) => schema.nodes.table!.create(null, rows);
const header = (...texts: string[]) =>
  row(
    ...texts.map((text) =>
      schema.nodes.table_header!.create(
        null,
        schema.nodes.paragraph!.create(null, schema.text(text)),
      ),
    ),
  );
const plainRows = (count: number) =>
  Array.from({ length: count }, (_, k) => row(cell(`r${k}a`), cell(`r${k}b`)));

const rect = (top: number, height: number): DOMRect =>
  ({ top, bottom: top + height, left: 0, right: 600, height, width: 600, x: 0, y: top }) as DOMRect;

// jsdom reads no text's rectangles: a cell's writing draws none unless a test says so.
beforeEach(() => {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
});

describe('lineStarts', () => {
  it('makes each row a line of its own', () => {
    expect(
      lineStarts([
        [1, 1],
        [1, 1],
        [1, 1],
      ]),
    ).toEqual([0, 1, 2]);
  });

  it('joins rows a cell spans into one line, so a page never cuts a merged cell', () => {
    expect(lineStarts([[2, 1], [1], [1, 3], [1], [1], [1, 1]])).toEqual([0, 2, 5]);
  });
});

describe('tableRowOffset', () => {
  it('finds a row start after the table opens and the rows before it', () => {
    const t = table(...plainRows(3));
    expect(tableRowOffset(t, 0)).toBe(1);
    expect(tableRowOffset(t, 2)).toBe(1 + t.child(0).nodeSize + t.child(1).nodeSize);
  });
});

describe('rulesOf a table', () => {
  it('breaks a table between rows, and moves it whole in a section of columns', () => {
    const t = table(...plainRows(2));
    // Its node goes with its rules: its header rows and the rows that may not break.
    expect(rulesOf(t, formatting)).toEqual({ table: t });
    expect(rulesOf(t, formatting, true)).toEqual({ atom: true });
  });
});

// A drawn table: its rows `ROW` high from its top, a page gap row `gap` high before row `gapAt`.
function drawTable(rowspans: number[][], gap?: { at: number; height: number }) {
  const element = document.createElement('table');
  const body = element.createTBody();
  rowspans.forEach((spans, r) => {
    if (gap?.at === r) {
      const g = body.insertRow();
      g.className = PAGE_GAP_CLASS;
    }
    const tr = body.insertRow();
    for (const span of spans) tr.insertCell().rowSpan = span;
  });
  document.body.append(element);
  const rows = [...body.rows];
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    let top = 0;
    for (const tr of rows) {
      const height = tr.classList.contains(PAGE_GAP_CLASS) ? (gap?.height ?? 0) : ROW;
      if (tr === this) return rect(top, height);
      top += height;
    }
    if (this === element) return rect(0, top);
    return rect(0, 0);
  });
  return element;
}

describe('measureBlock on a table', () => {
  it('reads its rows as its lines, the first from its top and the last to its foot', () => {
    const metrics = measureBlock(
      drawTable([
        [1, 1],
        [1, 1],
        [1, 1],
      ]),
      {},
      1,
      0,
    ).metrics;
    expect(metrics.height).toBe(90);
    expect(metrics.lines).toEqual([
      { top: 0, bottom: 30 },
      { top: 30, bottom: 60 },
      { top: 60, bottom: 90 },
    ]);
  });

  it('joins rows a cell spans, and closes up a page gap drawn between rows', () => {
    const element = drawTable([[2, 1], [1], [1, 1]], { at: 2, height: 100 });
    const metrics = measureBlock(element, {}, 1, 0).metrics;
    expect(metrics.height).toBe(90);
    expect(metrics.lines).toEqual([
      { top: 0, bottom: 60 },
      { top: 60, bottom: 90 },
    ]);
  });

  it('places a footnote mark in a cell on its row', () => {
    const element = drawTable([[1], [1], [1]]);
    const mark = document.createElement('sup');
    mark.dataset.footnote = 'note-1';
    element.tBodies[0]!.rows[1]!.cells[0]!.append(mark);
    mark.getBoundingClientRect = () => rect(38, 10);
    expect(measureBlock(element, {}, 1, 0).marks).toEqual([{ line: 1, story: 'note-1' }]);
  });

  it('repeats its header rows by their lines and height, never naming them a rule', () => {
    const node = table(header('H'), ...plainRows(2));
    const metrics = measureBlock(drawTable([[1], [1], [1]]), { table: node }, 1, 0).metrics;
    expect(metrics.repeat).toEqual({ lines: 1, height: 30 });
    expect(metrics).not.toHaveProperty('table');
  });

  it('reads no footnote mark in a copy of the header rows drawn at a page top', () => {
    const element = drawTable([[1], [1], [1]], { at: 2, height: 100 });
    const mark = document.createElement('sup');
    mark.dataset.footnote = 'note-1';
    element.tBodies[0]!.querySelector(`.${PAGE_GAP_CLASS}`)!.append(mark);
    const node = table(header('H'), ...plainRows(2));
    expect(measureBlock(element, { table: node }, 1, 0).marks).toEqual([]);
  });

  it('moves whole when its rules say so', () => {
    const metrics = measureBlock(drawTable([[1], [1]]), { atom: true }, 1, 0).metrics;
    expect(metrics).toMatchObject({ atom: true, lines: [], height: 60 });
  });
});

// A drawn table of a 30 px row, then a row whose cells hold lines of text (each line's rectangle, from the row's top).
function drawBreakingTable(cells: readonly (readonly [number, number][])[], rowHeight: number) {
  const element = document.createElement('table');
  const body = element.createTBody();
  body.insertRow().insertCell();
  const tall = body.insertRow();
  const lines = new Map<Node, DOMRect[]>();
  for (const own of cells) {
    const p = document.createElement('p');
    tall.insertCell().append(p);
    lines.set(
      p,
      own.map(([top, bottom]) => rect(ROW + top, bottom - top)),
    );
  }
  document.body.append(element);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === element) return rect(0, ROW + rowHeight);
    if (this === body.rows[0]) return rect(0, ROW);
    if (this === tall) return rect(ROW, rowHeight);
    return rect(0, 0);
  });
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value(this: Range) {
      return lines.get(this.startContainer) ?? [];
    },
  });
  return element;
}

describe('measureBlock on a table whose row breaks', () => {
  it("breaks a row between lines where its cells' lines stand level", () => {
    // Cell A has three lines, cell B two, at the same places: the row breaks between each.
    const element = drawBreakingTable(
      [
        [
          [4, 24],
          [34, 54],
          [64, 84],
        ],
        [
          [4, 24],
          [34, 54],
        ],
      ],
      90,
    );
    const { metrics, places } = measureBlock(element, {}, 1, 0);
    expect(metrics.lines).toEqual([
      { top: 0, bottom: 30 },
      { top: 30, bottom: 59 },
      { top: 59, bottom: 89 },
      { top: 89, bottom: 120 },
    ]);
    expect(places).toEqual([
      { row: 0, at: 0 },
      { row: 1, at: 0 },
      { row: 1, at: 29 },
      { row: 1, at: 59 },
    ]);
    expect(metrics.held).toBeUndefined();
  });

  it('holds the lines of a row that may not break', () => {
    const element = drawBreakingTable(
      [
        [
          [4, 24],
          [34, 54],
        ],
      ],
      60,
    );
    const node = table(
      row(cell('a')),
      schema.nodes.table_row!.create({ breaks: false }, [cell('b')]),
    );
    const { metrics } = measureBlock(element, { table: node }, 1, 0);
    expect(metrics.lines).toHaveLength(3);
    expect(metrics.held).toEqual([2]);
  });
});

describe('rowGap', () => {
  it('draws the page edge as a row across every column, hidden from reading and never text', () => {
    const gap = rowGap(80, { foot: 30, head: 38 }, { left: 10, width: 600 }, 3)();
    expect(gap.tagName).toBe('TR');
    expect(gap.classList.contains(PAGE_GAP_CLASS)).toBe(true);
    expect(gap.getAttribute('aria-hidden')).toBe('true');
    expect(gap.contentEditable).toBe('false');
    const td = gap.firstElementChild as HTMLTableCellElement;
    expect(td.colSpan).toBe(3);
    const bands = [...td.firstElementChild!.children] as HTMLElement[];
    expect(bands.map((b) => [b.className, b.style.height])).toEqual([
      [`${PAGE_GAP_CLASS}-paper`, '30px'],
      [`${PAGE_GAP_CLASS}-ground`, '12px'],
      [`${PAGE_GAP_CLASS}-paper`, '38px'],
    ]);
    expect(bands[0]!.style.marginLeft).toBe('-10px');
    expect(bands[0]!.style.width).toBe('600px');
  });
});

describe('cellGap', () => {
  it('draws the page edge and the header rows under it in one cell, and plain room in the others', () => {
    const edge = cellGap(90, {
      bands: { foot: 20, head: 18 },
      across: { left: 140, width: 600 },
      header: { table: table(header('Name')), left: 120 },
    })();
    expect(edge.getAttribute('aria-hidden')).toBe('true');
    expect(edge.contentEditable).toBe('false');
    expect(edge.style.height).toBe('90px');
    const [foot, ground, head, copy] = [...edge.children] as HTMLElement[];
    expect([foot, ground, head].map((b) => b!.style.height)).toEqual(['20px', '12px', '18px']);
    expect(foot!.style.marginLeft).toBe('-140px');
    expect(copy!.tagName).toBe('TABLE');
    expect(copy!.style.marginLeft).toBe('-120px');
    expect(copy!.textContent).toBe('Name');
    const room = cellGap(90)();
    expect(room.children).toHaveLength(0);
    expect(room.classList.contains(`${PAGE_GAP_CLASS}-twin`)).toBe(true);
    expect(edge.classList.contains(`${PAGE_GAP_CLASS}-twin`)).toBe(false);
  });
});

describe('headerCopy', () => {
  it('draws a header row again as a row of the table, hidden from reading and never text', () => {
    const copy = headerCopy(header('Name', 'Age'))();
    expect(copy.tagName).toBe('TR');
    expect(copy.classList.contains(PAGE_GAP_CLASS)).toBe(true);
    expect(copy.classList.contains(`${PAGE_GAP_CLASS}-header`)).toBe(true);
    expect(copy.getAttribute('aria-hidden')).toBe('true');
    expect(copy.contentEditable).toBe('false');
    expect([...copy.children].map((c) => [c.tagName, c.textContent])).toEqual([
      ['TH', 'Name'],
      ['TH', 'Age'],
    ]);
  });
});

describe('a table across pages', () => {
  // A page whose text area is 100 px high (75 pt) and 600 px wide.
  const setup: PageSetup = {
    width: 450,
    height: 75,
    orientation: 'portrait',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  };

  it('starts the next page with the row that does not fit, drawing the gap row before it', async () => {
    const place = document.createElement('div');
    document.body.append(place);
    const view = new EditorView(place, {
      state: EditorState.create({
        doc: schema.nodes.doc!.create(null, [table(...plainRows(5))]),
        plugins: [
          paginationPlugin({
            readFormatting: () => formatting,
            read: () => ({ setup, pages: true }),
            onPages: vi.fn(),
          }),
        ],
      }),
    });
    view.dom.style.width = '600px';
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('ProseMirror')) return rect(0, 1000);
      if (this.tagName === 'TABLE') return rect(0, 5 * ROW);
      if (this.tagName === 'TR' && !this.classList.contains(PAGE_GAP_CLASS)) {
        const own = [...this.parentElement!.children].filter(
          (r) => !r.classList.contains(PAGE_GAP_CLASS),
        );
        return rect(own.indexOf(this) * ROW, ROW);
      }
      return rect(0, 0);
    });
    relayoutPages(view);
    await Promise.resolve();
    const rows = [...view.dom.querySelectorAll('tbody > tr')];
    const gapAt = rows.findIndex((r) => r.classList.contains(PAGE_GAP_CLASS));
    // Three rows fill 90 of the page's 100 px: the fourth starts the next page.
    expect(gapAt).toBe(3);
    expect(rows[gapAt + 1]?.textContent).toBe('r3ar3b');
    expect((rows[gapAt]!.firstElementChild as HTMLTableCellElement).colSpan).toBe(2);
    view.destroy();
  });

  it('draws the header rows again after the gap, the gap their height shorter', async () => {
    const place = document.createElement('div');
    document.body.append(place);
    const view = new EditorView(place, {
      state: EditorState.create({
        doc: schema.nodes.doc!.create(null, [table(header('H1', 'H2'), ...plainRows(4))]),
        plugins: [
          paginationPlugin({
            readFormatting: () => formatting,
            read: () => ({ setup, pages: true }),
            onPages: vi.fn(),
          }),
        ],
      }),
    });
    view.dom.style.width = '600px';
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('ProseMirror')) return rect(0, 1000);
      if (this.tagName === 'TABLE') return rect(0, 5 * ROW);
      if (this.tagName === 'TR' && !this.classList.contains(PAGE_GAP_CLASS)) {
        const own = [...this.parentElement!.children].filter(
          (r) => !r.classList.contains(PAGE_GAP_CLASS),
        );
        return rect(own.indexOf(this) * ROW, ROW);
      }
      return rect(0, 0);
    });
    relayoutPages(view);
    await Promise.resolve();
    const rows = [...view.dom.querySelectorAll('tbody > tr')];
    const gapAt = rows.findIndex((r) => r.classList.contains(`${PAGE_GAP_CLASS}-row`));
    // The header and two rows fill 90 of the page's 100 px; the next page holds the copy, then the fourth row.
    expect(gapAt).toBe(3);
    const copy = rows[gapAt + 1]!;
    expect(copy.classList.contains(`${PAGE_GAP_CLASS}-header`)).toBe(true);
    expect(copy.textContent).toBe('H1H2');
    expect(rows[gapAt + 2]?.textContent).toBe('r2ar2b');
    // From the third row's foot (90) to the next text area (100 + 12): 22; the copy's 30 drawn after it.
    const bands = [
      ...rows[gapAt]!.querySelectorAll<HTMLElement>(`.${PAGE_GAP_CLASS}-inside > span`),
    ];
    expect(bands.map((b) => b.style.height)).toEqual(['10px', '12px', '0px']);
    expect(
      (rows[gapAt]!.querySelector(`.${PAGE_GAP_CLASS}-inside`) as HTMLElement).style.height,
    ).toBe('22px');
    view.destroy();
  });
});
