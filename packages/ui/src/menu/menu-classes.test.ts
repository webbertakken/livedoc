import { describe, expect, it } from 'vitest';
import { menuRadioRowClass } from './menu-classes';

describe('menuRadioRowClass', () => {
  it('tints the checked row', () => {
    expect(menuRadioRowClass(true)).toContain('bg-brand-100');
    expect(menuRadioRowClass(false)).not.toContain('bg-brand-100');
  });

  // docs/specs/004-interface-design/sizing.md: medium marks the selected row and nothing else.
  it('sets only the checked row in medium', () => {
    expect(menuRadioRowClass(true)).toContain('font-medium');
    expect(menuRadioRowClass(false)).not.toContain('font-medium');
  });

  it('draws a 28 px row at the reading size', () => {
    expect(menuRadioRowClass(false)).toContain('min-h-row');
    expect(menuRadioRowClass(false)).toContain('text-body');
    expect(menuRadioRowClass(false)).toContain('pointer-coarse:min-h-11');
  });
});
