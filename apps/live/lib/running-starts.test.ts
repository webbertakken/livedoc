import { describe, expect, it } from 'vitest';
import { runningStarts } from './running-starts';

describe('runningStarts', () => {
  it('returns no starts for no runs', () => {
    expect(runningStarts([])).toEqual([]);
  });

  it('starts the first run at zero', () => {
    expect(runningStarts([4])).toEqual([0]);
  });

  it('starts each run where the one before it ended', () => {
    expect(runningStarts([2, 0, 3, 1])).toEqual([0, 2, 2, 5]);
  });
});
