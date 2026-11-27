// docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar": Copy To carries a sheet whole into another
// spreadsheet, its other sheets named in formulas by their names (D184).
import { describe, expect, it } from 'vitest';
import { renderFormula, type SheetsCtx } from '../formula/stored';
import { cellKey, type Sheet } from '../sheet';
import { makeSheets } from '../testing/book';
import { sheetCopyOf } from './sheet-copy';

const handles = (sheets: Sheet[]) =>
  sheets.map((s) => ({ id: s.id, title: s.title, layout: s.layout }));
const ctxOf = (sheets: Sheet[], own: Sheet): SheetsCtx => {
  const hs = handles(sheets);
  return {
    own: hs.find((h) => h.id === own.id)!,
    byTitle: (t) => hs.find((h) => h.title.toLowerCase() === t.toLowerCase()),
    byId: (id) => hs.find((h) => h.id === id),
  };
};

describe('sheetCopyOf', () => {
  const book = () => {
    const sheets = makeSheets(
      {
        Budget: { A1: '2', B1: '=A1*2', C1: '=Costs!A1+1', D1: '=SUM(Costs!A1:A2)' },
        Costs: { A1: '40' },
      },
      { rows: 3, cols: 4 },
    );
    const budget = sheets[0]!;
    budget.layout = {
      ...budget.layout,
      tabColour: '#1a73e8',
      hidden: true,
      names: [
        {
          name: 'Total',
          ...{
            r1: budget.layout.rows[0]!,
            c1: budget.layout.cols[0]!,
            r2: budget.layout.rows[0]!,
            c2: budget.layout.cols[0]!,
          },
        },
      ],
      cardTables: [],
      formatRules: [
        {
          id: 'fr1',
          r1: budget.layout.rows[0]!,
          c1: budget.layout.cols[0]!,
          r2: budget.layout.rows[0]!,
          c2: budget.layout.cols[0]!,
          is: 'formula',
          fx: (
            budget.cells.get(cellKey(budget.layout.rows[0]!, budget.layout.cols[2]!))!
              .input as never as { f: never }
          ).f,
        } as never,
      ],
      rules: [
        {
          id: 'vr1',
          r1: budget.layout.rows[0]!,
          c1: budget.layout.cols[0]!,
          r2: budget.layout.rows[0]!,
          c2: budget.layout.cols[0]!,
          is: 'formula',
          fx: (
            budget.cells.get(cellKey(budget.layout.rows[0]!, budget.layout.cols[2]!))!
              .input as never as { f: never }
          ).f,
        },
      ],
    };
    return sheets;
  };

  it('copies the cells and the layout, other sheets read by name, never its names or card tables', () => {
    const sheets = book();
    const budget = sheets[0]!;
    const copy = sheetCopyOf(budget, ctxOf(sheets, budget), {
      id: 'copy1',
      title: 'Copy of Budget',
    });
    expect([copy.id, copy.title]).toEqual(['copy1', 'Copy of Budget']);
    expect(copy.layout.rows).toEqual(budget.layout.rows);
    expect(copy.layout.tabColour).toBe('#1a73e8');
    expect(['names', 'cardTables', 'hidden'].some((k) => k in copy.layout)).toBe(false);
    // Read where it lands: a workbook with no Costs reads it by name.
    const own = { id: 'copy1', title: 'Copy of Budget', layout: copy.layout };
    const there: SheetsCtx = {
      own,
      byTitle: () => undefined,
      byId: (id) => (id === 'copy1' ? own : undefined),
    };
    const text = copy.cells.map((c) => (c.i && 'f' in c.i ? renderFormula(c.i.f, there) : c.i));
    expect(text).toEqual([{ n: 2 }, '=A1*2', '=Costs!A1+1', '=SUM(Costs!A1:A2)']);
    const rule = copy.layout.formatRules![0]!;
    expect(rule.fx!.r[0]).toMatchObject({ st: 'Costs', p: [0, 0, -1, -1] });
    expect(copy.layout.rules![0]!.fx!.r[0]).toMatchObject({ st: 'Costs' });
  });

  it('reads a reference to a sheet gone as #REF!, and leaves a sheet with no other sheet named as it is', () => {
    const sheets = book();
    const budget = sheets[0]!;
    const lone = ctxOf([budget], budget);
    const copy = sheetCopyOf(budget, lone, { id: 'copy1', title: 'B' });
    const own = { id: 'copy1', title: 'B', layout: copy.layout };
    const there: SheetsCtx = { own, byTitle: () => undefined, byId: () => own };
    expect(copy.cells.map((c) => (c.i && 'f' in c.i ? renderFormula(c.i.f, there) : null))).toEqual(
      [null, '=A1*2', '=#REF!+1', '=SUM(#REF!)'],
    );
    const plain = makeSheets({ S: { A1: '1' } })[0]!;
    expect(sheetCopyOf(plain, ctxOf([plain], plain), { id: 'c', title: 'S' }).layout).toEqual(
      plain.layout,
    );
    // A format alone, and a format rule with no formula, go as they are.
    const [r, c] = [plain.layout.rows[1]!, plain.layout.cols[1]!];
    plain.cells.setCell(r, c, undefined, { b: true });
    const rule = { id: 'fr2', r1: r, c1: c, r2: r, c2: c, is: 'empty' } as never;
    plain.layout = { ...plain.layout, formatRules: [rule] };
    const formatted = sheetCopyOf(plain, ctxOf([plain], plain), { id: 'c', title: 'S' });
    expect(formatted.cells).toContainEqual({ r, c, f: { b: true } });
    expect(formatted.layout.formatRules).toEqual([rule]);
  });
});

describe('sheetCopyOf, pivot tables', () => {
  it('carries a pivot table reading another sheet by that sheet’s title, its own and charts as they are', () => {
    const sheets = makeSheets({ Report: {}, Data: {} }, { rows: 3, cols: 3 });
    const [report, data] = sheets as [Sheet, Sheet];
    const range = {
      r1: data.layout.rows[0]!,
      c1: data.layout.cols[0]!,
      r2: data.layout.rows[2]!,
      c2: data.layout.cols[2]!,
    };
    const at = { r: report.layout.rows[0]!, c: report.layout.cols[0]! };
    const reading = { id: 'pivot1', kind: 'pivot' as const, at, source: { ...range, s: data.id } };
    const own = { id: 'pivot2', kind: 'pivot' as const, at, source: { ...range } };
    const gone = { id: 'pivot3', kind: 'pivot' as const, at, source: { ...range, s: 'sheet9xx' } };
    const bare = { id: 'pivot4', kind: 'pivot' as const, at };
    report.layout = { ...report.layout, objects: [reading, own, gone, bare] };
    const copy = sheetCopyOf(report, ctxOf(sheets, report), { id: 'copy1', title: 'R' });
    expect(copy.layout.objects).toEqual([
      { ...reading, source: { ...range, st: 'Data' } },
      own,
      gone,
      bare,
    ]);
  });
});
