import { describe, expect, it } from 'vitest';
import { SCREENSHOT_QUALITY_STEPS, encodeToFit, fitWithin } from './screenshot';

// docs/specs/016-platform/bug-reports.md "The form": at most 1,600 px on the longer side and 1 MB, the quality
// stepped down until it fits (D14).

describe('fitWithin', () => {
  it.each([
    [
      [3200, 1800],
      [1600, 900],
    ],
    [
      [900, 3000],
      [480, 1600],
    ],
    [
      [800, 600],
      [800, 600],
    ],
    [
      [1600, 1600],
      [1600, 1600],
    ],
  ])('fits %j as %j', ([w, h], expected) => {
    expect(fitWithin(w!, h!, 1600)).toEqual({ width: expected[0], height: expected[1] });
  });
});

describe('encodeToFit', () => {
  const blob = (bytes: number, type = 'image/webp') => new Blob([new Uint8Array(bytes)], { type });

  it('takes the first quality that fits', async () => {
    const tried: number[] = [];
    const out = await encodeToFit(async (q) => (tried.push(q), blob(q > 0.65 ? 2000 : 900)), 1000);
    expect(out?.size).toBe(900);
    expect(tried).toEqual([0.9, 0.8, 0.7, 0.6]);
  });

  it('answers null when even the lowest quality is too large', async () => {
    expect(await encodeToFit(async () => blob(5000), 1000)).toBeNull();
  });

  it('answers null when the encoder gives nothing', async () => {
    expect(await encodeToFit(async () => null, 1000)).toBeNull();
  });

  it('steps from 0.9 to 0.4', () => {
    expect(SCREENSHOT_QUALITY_STEPS).toEqual([0.9, 0.8, 0.7, 0.6, 0.5, 0.4]);
  });
});
