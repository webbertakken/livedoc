// The OpenFormula-only functions' edges the oracle corpus leaves out (docs/specs/029-sheets/formulas.md "Functions"):
// far and tiny Bessel values, a union for AREAS, and errors in the arguments.
import { describe, expect, it } from 'vitest';
import { calc } from '../../testing/book';

const far = (x: number, sine: boolean): number =>
  Math.sqrt(2 / (Math.PI * x)) * (sine ? Math.sin(x - Math.PI / 4) : Math.cos(x - Math.PI / 4));

// Jₙ(x) by its first three terms, enough for a small x.
function series(x: number, n: number): number {
  let lead = 1;
  for (let k = 1; k <= n; k++) lead *= x / 2 / k;
  const q = (x / 2) ** 2;
  return lead * (1 - q / (n + 1) + (q * q) / (2 * (n + 1) * (n + 2)));
}

describe('the OpenFormula-only functions', () => {
  it.each([
    ['=BESSELJ(3E6, 0)', far(3e6, false)],
    ['=BESSELY(3E6, 0)', far(3e6, true)],
    // Far below 1 the recurrence rescales; the series' first terms give the value.
    ['=BESSELJ(0.1, 60)', series(0.1, 60)],
    ['=AREAS((A1:B2, C3))', 2],
    ['=EUROCONVERT(-1, "FRF", "DEM")', -0.3],
    ['=NUMBERVALUE("1.234,5 %", ",", ".")', 12.345],
  ])('%s is %d', (formula, value) => {
    expect((calc(formula) as number) / value).toBeCloseTo(1, 9);
  });

  it.each([
    ['=INFO(5)', '#VALUE!'],
    ['=AREAS(5)', '#VALUE!'],
    ['=NUMBERVALUE(NA())', '#N/A'],
    ['=EUROCONVERT("x", "FRF", "DEM")', '#VALUE!'],
    ['=EUROCONVERT(1, NA(), "DEM")', '#N/A'],
    ['=EUROCONVERT(1, "FRF", NA())', '#N/A'],
    ['=EUROCONVERT(1, "FRF", "DEM", "x")', '#VALUE!'],
    ['=EUROCONVERT(1, "FRF", "DEM", TRUE, "x")', '#VALUE!'],
  ])('%s is %s', (formula, code) => {
    expect(calc(formula)).toMatchObject({ e: code });
  });
});
