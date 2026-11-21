// Engineering functions beyond the oracle's cases (docs/specs/029-sheets/formulas.md "Functions": Engineering):
// errors in every argument, FALSE as a digit, results past the largest number, and IMLOG's base.
import { describe, expect, it } from 'vitest';
import { calc } from '../../testing/book';

function check(formula: string, value: unknown): void {
  const got = calc(formula);
  if (typeof value === 'object' && value !== null) expect(got).toMatchObject(value);
  else expect(got).toBe(value);
}

describe('Engineering', () => {
  it.each([
    ['=OCT2DEC("7")', 7],
    ['=ERF.PRECISE(0, 0)', 0],
    ['=COMPLEX(1, 2, "")', '1+2i'],
    ['=IMSUM(1, 2)', '3'],
    ['=IMSUM("45", "1+j")', '46+j'],
  ])('%s is %s', (formula, value) => check(formula, value));

  it.each([
    ['=BIN2DEC(NA())', '#N/A'],
    ['=DEC2BIN(1, NA())', '#N/A'],
    ['=DEC2BIN(NA())', '#N/A'],
    ['=COMPLEX(NA(), 1)', '#N/A'],
    ['=COMPLEX(1, NA())', '#N/A'],
    ['=COMPLEX(1, 1, NA())', '#N/A'],
    ['=BIN2DEC(FALSE)', '#VALUE!'],
    ['=IMSUM("1+i", "x")', '#NUM!'],
    ['=IMEXP(1000)', '#NUM!'],
    ['=IMLOG("x", 2)', '#NUM!'],
    ['=IMLOG(1, NA())', '#N/A'],
    ['=IMLOG(2, 0)', '#NUM!'],
    ['=IMLOG(2, 1)', '#NUM!'],
    ['=IMLOG(0, 2)', '#NUM!'],
  ])('%s is %s', (formula, e) => check(formula, { e }));
});
