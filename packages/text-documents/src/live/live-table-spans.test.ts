// docs/specs/034-text-documents/review.md "Across merged cells", "How a suggestion is kept": taking a row or column
// away (an insertion rejected, a deletion accepted) shrinks every merged cell crossing it by one; one starting in a row
// taken away starts in the next, keeping its writing; nothing else of a table moves.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { DELETION_MARK, INSERTION_MARK, LiveSuggestions } from './live-suggestions';

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const mark = (id: string) => ({ id, at: 10, author: ADA });

type CellSpec = {
  text: string;
  rs?: number;
  cs?: number;
  widths?: number[];
  ins?: string;
  del?: string;
};
type RowSpec = { cells: CellSpec[]; ins?: string; del?: string };

function cellElement(spec: CellSpec): Y.XmlElement {
  const cell = new Y.XmlElement('table_cell');
  if (spec.rs) cell.setAttribute('rowspan', spec.rs as unknown as string);
  if (spec.cs) cell.setAttribute('colspan', spec.cs as unknown as string);
  if (spec.widths) cell.setAttribute('colwidth', spec.widths as unknown as string);
  if (spec.ins) cell.setAttribute(INSERTION_MARK, mark(spec.ins) as unknown as string);
  if (spec.del) cell.setAttribute(DELETION_MARK, mark(spec.del) as unknown as string);
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText(spec.text)]);
  cell.insert(0, [paragraph]);
  return cell;
}

/** A doc whose body is one table of these rows. */
function tableDoc(rows: RowSpec[]) {
  const doc = new Y.Doc({ gc: false });
  const body = doc.getXmlFragment('body');
  const table = new Y.XmlElement('table');
  table.insert(
    0,
    rows.map((spec) => {
      const row = new Y.XmlElement('table_row');
      if (spec.ins) row.setAttribute(INSERTION_MARK, mark(spec.ins) as unknown as string);
      if (spec.del) row.setAttribute(DELETION_MARK, mark(spec.del) as unknown as string);
      row.insert(0, spec.cells.map(cellElement));
      return row;
    }),
  );
  body.insert(0, [table]);
  return { doc, table };
}

/** The table as rows of `text` or `text rs×cs`, widths after a colon where kept. */
function gridOf(table: Y.XmlElement): string[][] {
  return table.toArray().map((row) =>
    (row as Y.XmlElement).toArray().map((node) => {
      const cell = node as Y.XmlElement;
      const text = ((cell.get(0) as Y.XmlElement).get(0) as Y.XmlText).toJSON();
      const rs = (cell.getAttribute('rowspan') as unknown as number | undefined) ?? 1;
      const cs = (cell.getAttribute('colspan') as unknown as number | undefined) ?? 1;
      const widths = cell.getAttribute('colwidth') as unknown as number[] | undefined;
      const marked =
        cell.getAttribute(INSERTION_MARK) !== undefined ||
        cell.getAttribute(DELETION_MARK) !== undefined;
      return `${text}${rs > 1 || cs > 1 ? ` ${rs}×${cs}` : ''}${widths ? `:${widths.join(',')}` : ''}${marked ? '*' : ''}`;
    }),
  );
}

describe('settling a row or column a merged cell crosses', () => {
  it('shrinks a merged cell a rejected row grew, exactly', () => {
    const { doc, table } = tableDoc([
      { cells: [{ text: 'A', rs: 3 }, { text: 'B' }] },
      { cells: [{ text: 'C' }] },
      { cells: [{ text: 'X' }], ins: 'r1' },
    ]);
    LiveSuggestions.reject(doc, 'r1', 'test');
    expect(gridOf(table)).toEqual([['A 2×1', 'B'], ['C']]);
  });

  it('keeps the grown merged cell when the row is accepted', () => {
    const { doc, table } = tableDoc([
      { cells: [{ text: 'A', rs: 3 }, { text: 'B' }] },
      { cells: [{ text: 'X' }], ins: 'r1' },
      { cells: [{ text: 'C' }] },
    ]);
    LiveSuggestions.accept(doc, 'r1', 'test');
    expect(gridOf(table)).toEqual([['A 3×1', 'B'], ['X'], ['C']]);
  });

  it('shrinks a merged cell crossing a deleted row accepted', () => {
    const { doc, table } = tableDoc([
      { cells: [{ text: 'A', rs: 3 }, { text: 'B' }] },
      { cells: [{ text: 'C' }], del: 'd1' },
      { cells: [{ text: 'D' }] },
    ]);
    LiveSuggestions.accept(doc, 'd1', 'test');
    expect(gridOf(table)).toEqual([['A 2×1', 'B'], ['D']]);
  });

  it('starts a merged cell in the next row when the row it starts in is taken away', () => {
    const { doc, table } = tableDoc([
      { cells: [{ text: 'A', rs: 2 }, { text: 'B' }], del: 'd1' },
      { cells: [{ text: 'C' }] },
      { cells: [{ text: 'E' }, { text: 'F' }] },
    ]);
    LiveSuggestions.accept(doc, 'd1', 'test');
    expect(gridOf(table)).toEqual([
      ['A', 'C'],
      ['E', 'F'],
    ]);
  });

  it('places a merged cell moved down after the cells before it in its new row', () => {
    const { doc, table } = tableDoc([
      { cells: [{ text: 'A' }, { text: 'B', rs: 3 }], ins: 'r1' },
      { cells: [{ text: 'C' }] },
      { cells: [{ text: 'D' }] },
    ]);
    LiveSuggestions.reject(doc, 'r1', 'test');
    expect(gridOf(table)).toEqual([['C', 'B 2×1'], ['D']]);
  });

  it('shrinks a merged cell a rejected column grew, its widths with it', () => {
    const { doc, table } = tableDoc([
      { cells: [{ text: 'A', cs: 3, widths: [10, 20, 30] }] },
      {
        cells: [
          { text: 'B', widths: [10] },
          { text: 'X', widths: [20], ins: 'c1' },
          { text: 'C', widths: [30] },
        ],
      },
    ]);
    LiveSuggestions.reject(doc, 'c1', 'test');
    expect(gridOf(table)).toEqual([['A 1×2:10,30'], ['B:10', 'C:30']]);
  });

  it('shrinks a merged cell crossing a deleted column accepted', () => {
    const { doc, table } = tableDoc([
      { cells: [{ text: 'B' }, { text: 'X', del: 'c1' }, { text: 'C' }] },
      { cells: [{ text: 'A', cs: 3 }] },
      { cells: [{ text: 'D' }, { text: 'Y', del: 'c1' }, { text: 'E' }] },
    ]);
    LiveSuggestions.accept(doc, 'c1', 'test');
    expect(gridOf(table)).toEqual([['B', 'C'], ['A 1×2'], ['D', 'E']]);
  });

  it('leaves a merged cell no row or column taken away crosses', () => {
    const { doc, table } = tableDoc([
      { cells: [{ text: 'A', rs: 2 }, { text: 'B' }] },
      { cells: [{ text: 'C' }] },
      { cells: [{ text: 'X' }, { text: 'Y' }], ins: 'r1' },
    ]);
    LiveSuggestions.reject(doc, 'r1', 'test');
    expect(gridOf(table)).toEqual([['A 2×1', 'B'], ['C']]);
  });
});

// review.md "The room judges a Participant's update": a row of the sender's own that grew someone's merged cell reads,
// with their suggestions rejected, as the table before it.
describe('a merged cell grown by one’s own suggested row, read with one’s suggestions rejected', () => {
  it('reads as the table before the row', () => {
    const before = tableDoc([
      { cells: [{ text: 'A', rs: 2 }, { text: 'B' }] },
      { cells: [{ text: 'C' }] },
    ]);
    const after = tableDoc([
      { cells: [{ text: 'A', rs: 3 }, { text: 'B' }] },
      { cells: [{ text: 'X' }], ins: 'r1' },
      { cells: [{ text: 'C' }] },
    ]);
    const read = (doc: Y.Doc) => LiveSuggestions.ownRejected(doc.getXmlFragment('body'), ADA.key);
    expect(read(after.doc)).toBe(read(before.doc));
  });

  it('reads a column that grew a merged cell, its width with it, as the table before', () => {
    const before = tableDoc([
      { cells: [{ text: 'W', cs: 2, widths: [100, 100] }] },
      { cells: [{ text: 'A', widths: [100] }, { text: 'B', widths: [100] }] },
    ]);
    const after = tableDoc([
      { cells: [{ text: 'W', cs: 3, widths: [100, 80, 100] }] },
      {
        cells: [
          { text: 'A', widths: [100] },
          { text: '', widths: [80], ins: 'c1' },
          { text: 'B', widths: [100] },
        ],
      },
    ]);
    const read = (doc: Y.Doc) => LiveSuggestions.ownRejected(doc.getXmlFragment('body'), ADA.key);
    expect(read(after.doc)).toBe(read(before.doc));
  });

  it('still tells a merged cell someone else changed', () => {
    const before = tableDoc([
      { cells: [{ text: 'A', rs: 2 }, { text: 'B' }] },
      { cells: [{ text: 'C' }] },
    ]);
    const after = tableDoc([
      { cells: [{ text: 'A' }, { text: 'B' }] },
      { cells: [{ text: 'D' }, { text: 'C' }] },
    ]);
    const read = (doc: Y.Doc) => LiveSuggestions.ownRejected(doc.getXmlFragment('body'), ADA.key);
    expect(read(after.doc)).not.toBe(read(before.doc));
  });
});
