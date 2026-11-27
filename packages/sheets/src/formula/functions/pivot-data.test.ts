// docs/specs/029-sheets/formulas.md "Lookup" (D603): GETPIVOTDATA's arguments beyond Google's probes (pivot-google.test).
import { describe, expect, it } from 'vitest';
import { book } from '../../testing/book';
import type { Sheet } from '../../sheet';
import type { SheetPivot } from '../../objects/sheet-pivot';

function withPivot(probes: Record<string, string>) {
  const b = book(
    {
      Data: { A1: 'Region', B1: 'Units', A2: 'East', B2: '5', A3: '', B3: '3', D1: '=SEQUENCE(2)' },
      Report: {},
      Probes: probes,
    },
    { rows: 8, cols: 6, arrays: 'google' },
  );
  const [data, report] = b.sheets as [Sheet, Sheet];
  const pivot: SheetPivot = {
    id: 'pivot01',
    kind: 'pivot',
    at: { r: report.layout.rows[0]!, c: report.layout.cols[0]! },
    source: {
      r1: data.layout.rows[0]!,
      c1: data.layout.cols[0]!,
      r2: data.layout.rows[2]!,
      c2: data.layout.cols[1]!,
      s: data.id,
    },
    rows: [{ col: data.layout.cols[0]! }],
    values: [{ col: data.layout.cols[1]!, summary: 'SUM' }],
  };
  const next = { ...report, layout: { ...report.layout, objects: [pivot] } };
  b.sheets[1] = next;
  b.wb.updateSheet(next);
  return (a1: string) => b.v(a1, 'Probes');
}

describe('GETPIVOTDATA', () => {
  it('reads a blank item by an empty cell, and passes an error in any argument on', () => {
    const v = withPivot({
      A1: '=GETPIVOTDATA("Units", Report!A1, "Region", Data!C1)',
      A2: '=GETPIVOTDATA(1/0, Report!A1)',
      A3: '=GETPIVOTDATA("Units", Report!A1, 1/0, "East")',
      A4: '=GETPIVOTDATA("Units", Report!A1, "Region", NA())',
      A5: '=GETPIVOTDATA("Units", Data!D2)',
      A6: '=GETPIVOTDATA("Units", "Report!A1")',
      A7: '=GETPIVOTDATA("Units", Report!B3, "Region", "east")',
    });
    expect(v('A1')).toBe(3);
    expect(v('A2')).toMatchObject({ e: '#DIV/0!' });
    expect(v('A3')).toMatchObject({ e: '#DIV/0!' });
    expect(v('A4')).toMatchObject({ e: '#N/A' });
    expect(v('A5')).toMatchObject({ e: '#REF!' });
    expect(v('A6')).toMatchObject({ e: '#REF!' });
    expect(v('A7')).toBe(5);
  });
});
