import { describe, expect, it } from 'vitest';
import { LABEL_SHRINK_MIN_PX, shrinkLabelPx } from './svg-render-primitives';

// docs/specs/004-interface-design/fonts.md "Shrink to fit".

const box = { width: 120, height: 120, padding: 14 };

describe('shrinkLabelPx', () => {
  it('keeps the size of a label that fits', () => {
    expect(shrinkLabelPx({ ...box, text: 'Save', px: 18 })).toBe(18);
  });

  it('shrinks a label that overflows until it fits, never past the floor', () => {
    const long = 'A long label that cannot possibly fit inside a small box at this size at all';
    const px = shrinkLabelPx({ ...box, text: long, px: 36 });
    expect(px).toBeLessThan(36);
    expect(px).toBeGreaterThanOrEqual(LABEL_SHRINK_MIN_PX);
    expect(shrinkLabelPx({ ...box, text: long.repeat(20), px: 36 })).toBe(LABEL_SHRINK_MIN_PX);
  });

  it('shrinks a word wider than the box', () => {
    expect(shrinkLabelPx({ ...box, text: 'Supercalifragilistic', px: 30 })).toBeLessThan(30);
  });
});
