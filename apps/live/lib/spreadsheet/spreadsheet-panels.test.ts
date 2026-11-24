// formatting.md "Alternating colours" (D216): opening the panel makes a banding over the selection at once; closing it
// writes nothing.
import { describe, expect, it, vi } from 'vitest';
import { withBandingOnOpen } from './spreadsheet-panels';

describe('withBandingOnOpen', () => {
  it('adds a banding as the panel opens, never as it closes', () => {
    const add = vi.fn();
    const run = vi.fn();
    withBandingOnOpen({ 'alternating-colours': { run, checked: false } }, add)[
      'alternating-colours'
    ]!.run();
    expect([add.mock.calls.length, run.mock.calls.length]).toEqual([1, 1]);
    withBandingOnOpen({ 'alternating-colours': { run, checked: true } }, add)[
      'alternating-colours'
    ]!.run();
    expect([add.mock.calls.length, run.mock.calls.length]).toEqual([1, 2]);
    const none = {};
    expect(withBandingOnOpen(none, add)).toBe(none);
  });
});
