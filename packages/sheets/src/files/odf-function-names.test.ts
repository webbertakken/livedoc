import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromOpenFormula, toOpenFormula } from './open-formula';
import {
  GOOGLE_ONLY_FUNCTIONS,
  ODF_FUNCTION_NAMES,
  googleFunctionName,
  odfFunctionName,
} from './odf-function-names';

const spec = readFileSync(
  new URL('../../../../docs/specs/029-sheets/formulas.md', import.meta.url),
  'utf8',
);

// The catalogue's rows: name and ODF name, from formulas.md "Function catalogue".
function catalogue(): [string, string][] {
  const section = spec.slice(
    spec.indexOf('## Function catalogue'),
    spec.indexOf('## Other workbooks'),
  );
  return section
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => {
      const cells = line.split('|').map((c) => c.trim().replaceAll('`', ''));
      return [cells[1]!, cells[5]!];
    });
}

describe('ODF function names', () => {
  // formulas.md "Function catalogue": the ODF name column is how an ODF file writes each function.
  it("are the catalogue's ODF name column, Google's own under S5", () => {
    const rows = catalogue();
    expect(rows.length).toBeGreaterThan(500);
    const renamed = Object.fromEntries(rows.filter(([n, o]) => o !== n && o !== 'S5'));
    expect(ODF_FUNCTION_NAMES).toEqual(renamed);
    expect([...GOOGLE_ONLY_FUNCTIONS].sort()).toEqual(
      rows
        .filter(([, o]) => o === 'S5')
        .map(([n]) => n)
        .sort(),
    );
  });

  it('go both ways, case ignored', () => {
    expect(odfFunctionName('ifs')).toBe('COM.MICROSOFT.IFS');
    expect(odfFunctionName('split')).toBe('ORG.LIVEDOC.SPLIT');
    expect(odfFunctionName('Sum')).toBe('Sum');
    expect(googleFunctionName('com.microsoft.ifs')).toBe('IFS');
    expect(googleFunctionName('ORG.LIVEDOC.SPLIT')).toBe('SPLIT');
    expect(googleFunctionName('SUM')).toBe('SUM');
  });

  // standard-mapping.md "Formulas in the file's own syntax".
  it('are written and read in a formula, never a name or a sheet that looks like one', () => {
    const f = '=IFS(A1>0, SPLIT(B1, ","), TRUE, SUM(C1:C2))';
    const odf = toOpenFormula(f)!;
    expect(odf).toBe(
      'of:=COM.MICROSOFT.IFS([.A1]>0; ORG.LIVEDOC.SPLIT([.B1]; ","); TRUE(); SUM([.C1:.C2]))',
    );
    expect(fromOpenFormula(odf)).toBe('=IFS(A1>0, SPLIT(B1, ","), TRUE, SUM(C1:C2))');
    expect(fromOpenFormula('of:=COM.MICROSOFT.IFS + 1')).toBe('=COM.MICROSOFT.IFS + 1');
  });
});
