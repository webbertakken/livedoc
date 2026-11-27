// formatting.md "Alternating colours" (D216): opening the panel makes a banding over the selection at once; closing it
// writes nothing.
import { describe, expect, it, vi } from 'vitest';
import {
  withBandingOnOpen,
  withNamedRangesPanel,
  withProtectionPanel,
  withValidationPanel,
} from './spreadsheet-panels';

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

// data-validation.md "In a spreadsheet": Data › Data Validation, Insert › Checkbox and Insert › Dropdown.
describe('withValidationPanel', () => {
  const opts = () => ({ addCheckbox: vi.fn(), opened: vi.fn(), reveal: vi.fn() });

  it('opens on the active cell’s rule, notes nothing as it closes', () => {
    const o = opts();
    const run = vi.fn();
    withValidationPanel({ 'data-validation': { run, checked: false } }, o)[
      'data-validation'
    ]!.run();
    expect(o.opened).toHaveBeenCalledWith(false);
    withValidationPanel({ 'data-validation': { run, checked: true } }, o)['data-validation']!.run();
    expect([o.opened.mock.calls.length, run.mock.calls.length]).toEqual([1, 2]);
  });

  it('makes a checkbox at once, and opens a new dropdown in the panel', () => {
    const o = opts();
    const bound = withValidationPanel({ 'data-validation': { run: vi.fn() } }, o);
    bound['insert-checkbox']!.run();
    expect(o.addCheckbox).toHaveBeenCalledOnce();
    bound['insert-dropdown']!.run();
    expect(o.opened).toHaveBeenCalledWith(true);
    expect(o.reveal).toHaveBeenCalledOnce();
  });

  it('binds nothing for someone the panel is not bound for', () => {
    const none = {};
    expect(withValidationPanel(none, opts())).toBe(none);
  });
});

// data-tools.md "Named ranges and named functions": Data › Named Ranges, and the cell menu's Define Named Range.
describe('withNamedRangesPanel', () => {
  const opts = (canShape = true) => ({ opened: vi.fn(), reveal: vi.fn(), canShape });

  it('opens as it opens (D299), and notes nothing as it closes', () => {
    const o = opts();
    const run = vi.fn();
    withNamedRangesPanel({ 'named-ranges': { run, checked: false } }, o)['named-ranges']!.run();
    expect(o.opened).toHaveBeenCalledWith(false);
    withNamedRangesPanel({ 'named-ranges': { run, checked: true } }, o)['named-ranges']!.run();
    expect([o.opened.mock.calls.length, run.mock.calls.length]).toEqual([1, 2]);
  });

  it('opens on Add a Range for Define Named Range, an Editor’s alone', () => {
    const o = opts();
    withNamedRangesPanel({ 'named-ranges': { run: vi.fn() } }, o)['define-named-range']!.run();
    expect(o.opened).toHaveBeenCalledWith(true);
    expect(o.reveal).toHaveBeenCalledOnce();
    const reader = withNamedRangesPanel({ 'named-ranges': { run: vi.fn() } }, opts(false));
    expect(reader['define-named-range']).toBeUndefined();
    const none = {};
    expect(withNamedRangesPanel(none, o)).toBe(none);
  });
});

// data-tools.md "Protected ranges": Data › Protect Sheets and Ranges and the menus' Protect Range.
describe('withProtectionPanel', () => {
  const opts = (canShape = true) => ({ opened: vi.fn(), reveal: vi.fn(), canShape });
  const item = 'protect-sheets-and-ranges';

  it('opens on its list, notes nothing as it closes, and opens Protect Range on a new range for an Editor', () => {
    const o = opts();
    const run = vi.fn();
    const bound = withProtectionPanel({ [item]: { run, checked: false } }, o);
    bound[item]!.run();
    expect(o.opened).toHaveBeenCalledWith(null);
    withProtectionPanel({ [item]: { run, checked: true } }, o)[item]!.run();
    expect([o.opened.mock.calls.length, run.mock.calls.length]).toEqual([1, 2]);
    bound['protect-range']!.run();
    expect(o.opened).toHaveBeenLastCalledWith('range');
    expect(o.reveal).toHaveBeenCalledOnce();
    expect(withProtectionPanel({ [item]: { run } }, opts(false))['protect-range']).toBeUndefined();
    const none = {};
    expect(withProtectionPanel(none, o)).toBe(none);
  });
});
