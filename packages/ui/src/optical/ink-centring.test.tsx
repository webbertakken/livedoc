// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlyphDisc } from './GlyphDisc';
import { inkCentreShift, isInkCentred, resetInkCentringForTests } from './ink-centring';

// docs/specs/004-interface-design/optical-alignment.md "The rules": initials and symbols are centred by their ink,
// numerals by their advance. A disc moves its glyph by half the difference of its side bearings, as the face draws it.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetInkCentringForTests();
});

describe('inkCentreShift', () => {
  it('moves ink that leans left to the right, by half the difference of its side bearings', () => {
    // "LW" in a sans: advance 20, ink from 1 to 17 (left bearing 1, right bearing 3): ink centre 9, box centre 10.
    expect(inkCentreShift({ advance: 20, inkLeft: 1, inkRight: 17 })).toBe(1);
  });

  it('moves ink that leans right to the left', () => {
    expect(inkCentreShift({ advance: 20, inkLeft: 3, inkRight: 20 })).toBe(-1.5);
  });

  it('leaves balanced ink where it is', () => {
    expect(inkCentreShift({ advance: 20, inkLeft: 2, inkRight: 18 })).toBe(0);
  });
});

describe('isInkCentred', () => {
  it('centres initials and symbols by ink, numerals by advance', () => {
    for (const text of ['LW', 'AB', 'QW', 'TY', 'LL', 'JW', 'W', '?'])
      expect(isInkCentred(text)).toBe(true);
    for (const text of ['3', '12', '+3', '']) expect(isInkCentred(text)).toBe(false);
  });
});

// A canvas whose measureText reports "LW" leaning left by 2 px of bearing.
function fakeCanvas(metrics: { width: number; left: number; right: number }) {
  const measureText = vi.fn(() => ({
    width: metrics.width,
    actualBoundingBoxLeft: metrics.left,
    actualBoundingBoxRight: metrics.right,
  }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText,
  } as unknown as CanvasRenderingContext2D);
  return measureText;
}

describe('GlyphDisc ink centring', () => {
  it('shifts initials by their ink, measured in the face the disc draws them in', async () => {
    // Ink from 1 to 17 of a 20 px advance: actualBoundingBoxLeft is -1 (ink starts right of the origin).
    const measureText = fakeCanvas({ width: 20, left: -1, right: 17 });
    const { container } = render(<GlyphDisc size={28}>LW</GlyphDisc>);
    await act(async () => {});
    const glyph = container.querySelector('.text-optical-centre') as HTMLElement;
    expect(measureText).toHaveBeenCalledWith('LW');
    expect(glyph.style.translate).toBe('1px');
  });

  it('leaves numerals advance-centred, as the typeface draws them', async () => {
    const measureText = fakeCanvas({ width: 20, left: -1, right: 17 });
    const { container } = render(<GlyphDisc size={28}>{7}</GlyphDisc>);
    await act(async () => {});
    const glyph = container.querySelector('.text-optical-centre') as HTMLElement;
    expect(measureText).not.toHaveBeenCalled();
    expect(glyph.style.translate).toBe('');
  });

  it('draws unshifted where the browser cannot measure text', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { container } = render(<GlyphDisc size={28}>LW</GlyphDisc>);
    await act(async () => {});
    expect((container.querySelector('.text-optical-centre') as HTMLElement).style.translate).toBe(
      '',
    );
  });
});
