import { describe, expect, it } from 'vitest';
import type { Frame, Lambda } from '../engine/frame';
import { budgetCalls, callLambda } from './lambda';

// formulas.md "LAMBDA and LET": each application counts against the recalculation budget (D68).
const spent = { spend: () => false } as unknown as Frame;
const lambda: Lambda = { params: ['x'], apply: ([x]) => x! };

describe('the LAMBDA budget', () => {
  it('is #NUM! once the recalculation budget is spent', () => {
    expect(budgetCalls(spent, 3)).toMatchObject({ e: '#NUM!' });
    expect(callLambda(lambda, [1], spent)).toMatchObject({ e: '#NUM!' });
  });

  it('applies while the budget lasts', () => {
    expect(callLambda(lambda, [1], { spend: () => true } as unknown as Frame)).toBe(1);
  });
});
