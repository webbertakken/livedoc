import { describe, expect, it } from 'vitest';
import { isCountKind, summaryShown, summaryValue, SUMMARY_KINDS } from './selection-summary';

const stats = { sum: 10, count: 6, numbers: 4, min: 1, max: 4 };
const texts = { sum: 0, count: 3, numbers: 0, min: Infinity, max: -Infinity };

// docs/specs/029-sheets/surface.md "Sheet bar", D132.
describe('the selection summary', () => {
  it('holds Google’s six kinds, each from the counts', () => {
    expect(SUMMARY_KINDS.map((k) => summaryValue(k, stats))).toEqual([10, 2.5, 1, 4, 6, 4]);
  });

  it('has no average, least or most of no number', () => {
    expect(SUMMARY_KINDS.map((k) => summaryValue(k, texts))).toEqual([0, null, null, null, 3, 0]);
  });

  it('shows the pick, or Count where no number is selected', () => {
    expect(summaryShown('Average', stats)).toBe('Average');
    expect(summaryShown('Average', texts)).toBe('Count');
  });

  it('writes counts as whole numbers', () => {
    expect(SUMMARY_KINDS.filter(isCountKind)).toEqual(['Count', 'Count Numbers']);
  });
});
