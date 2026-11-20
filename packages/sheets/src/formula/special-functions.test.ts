// The special functions against reference values (Wolfram Alpha, 16 digits), held to one part in 10^13.
import { describe, expect, it } from 'vitest';
import { erf, erfc, gammaLn } from './special-functions';

function near(got: number, want: number): void {
  expect(Math.abs(got / want - 1)).toBeLessThan(1e-13);
}

describe('gammaLn', () => {
  it.each([
    [5, 3.178053830347946],
    [0.5, 0.5723649429247001],
    [1e-5, 11.51291969289582],
    [100, 359.1342053695754],
    [1.5, -0.1207822376352452],
    [1e6, 12815504.56914761],
  ])('ln Γ(%d)', (x, want) => {
    near(gammaLn(x), want);
  });

  it('is 0 at 1 and 2', () => {
    expect(Math.abs(gammaLn(1))).toBeLessThan(1e-15);
    expect(Math.abs(gammaLn(2))).toBeLessThan(1e-15);
  });
});

describe('erf and erfc', () => {
  it.each([
    [0.1, 0.887537083981715],
    [1, 0.1572992070502851],
    [1.9, 0.007209570764742278],
    [2, 0.004677734981047266],
    [3, 2.209049699858544e-5],
    [10, 2.088487583762545e-45],
    [26, 5.663192408856143e-296],
    [-1, 1.842700792949715],
  ])('erfc(%d)', (x, want) => {
    near(erfc(x), want);
  });

  it.each([
    [0.1, 0.1124629160182849],
    [1, 0.8427007929497149],
    [2.5, 0.999593047982555],
    [-2.5, -0.999593047982555],
    [-0.5, -0.5204998778130465],
  ])('erf(%d)', (x, want) => {
    near(erf(x), want);
  });

  it('is exact at 0', () => {
    expect(erf(0)).toBe(0);
    expect(erfc(0)).toBe(1);
  });
});
