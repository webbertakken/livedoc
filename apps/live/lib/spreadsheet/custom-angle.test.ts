import { describe, expect, it } from 'vitest';
import { CUSTOM_ANGLE_PROBLEM, customAngleOf, customAngleStart } from './custom-angle';

// docs/specs/029-sheets/formatting.md "Alignment, wrapping, rotation" (D211).
describe('customAngleOf', () => {
  it('reads a whole angle from −90 to 90, 0 clearing', () => {
    expect(customAngleOf('30')).toEqual({ ok: true, ro: 30 });
    expect(customAngleOf(' -90 ')).toEqual({ ok: true, ro: -90 });
    expect(customAngleOf('−15')).toEqual({ ok: true, ro: -15 });
    expect(customAngleOf('+90')).toEqual({ ok: true, ro: 90 });
    expect(customAngleOf('0')).toEqual({ ok: true, ro: null });
  });

  it('says why for anything else', () => {
    for (const text of ['', '12.5', '91', '-91', 'abc', '1e2'])
      expect(customAngleOf(text)).toEqual({ ok: false, problem: CUSTOM_ANGLE_PROBLEM });
  });
});

describe('customAngleStart', () => {
  it('starts at the active cell’s angle, 0 at none or stacked', () => {
    expect(customAngleStart({ ro: -30 })).toBe('-30');
    expect(customAngleStart({ ro: 'v' })).toBe('0');
    expect(customAngleStart(undefined)).toBe('0');
  });
});
