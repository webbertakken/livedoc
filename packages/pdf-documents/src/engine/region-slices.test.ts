import { describe, expect, it } from 'vitest';
import type { MarkFaceSlice } from '../mark-face-families';
import { MarkFaceSlices } from '../mark-face-slices';
import { sliceIndex, splitRun } from './region-slices';

const slice = (id: string, range: string): MarkFaceSlice => ({
  id,
  file: `${id}.woff`,
  range,
  url: () => new URL(`https://example.invalid/${id}.woff`),
});

// marks.md "Laying out": the bake sets a region's run slice by slice.
describe('a region run slice by slice', () => {
  const slices = [slice('a', 'U+4E00-4E01,U+3002'), slice('b', 'U+4E01-4E02')];
  const index = sliceIndex(slices);

  it('finds each character in the first slice whose range holds it', () => {
    expect(index.get(0x4e01)!.id).toBe('a');
    expect(index.get(0x4e02)!.id).toBe('b');
    expect(index.has(0x4e03)).toBe(false);
  });

  it('cuts a run where the slice changes, a character no slice holds kept with the one before', () => {
    const run = { face: 'noto-sans-sc-400', text: '\u4e00\u4e02\u4e03\u3002' };
    expect(splitRun(run, index, slices)).toEqual([
      { face: 'a', text: '\u4e00' },
      { face: 'b', text: '\u4e02\u4e03' },
      { face: 'a', text: '\u3002' },
    ]);
    expect(splitRun({ face: 'noto-sans-sc-400', text: '\u4e03' }, index, slices)).toEqual([
      { face: 'a', text: '\u4e03' },
    ]);
  });

  it('holds every character its region is measured to have in one of its slices', async () => {
    const real = await MarkFaceSlices.load('jp');
    const held = sliceIndex(real);
    for (const character of Array.from('東京ですカタカナ、。'))
      expect(held.has(character.codePointAt(0)!), character).toBe(true);
    expect(MarkFaceSlices.regionOf('noto-sans-jp-400')).toBe('jp');
    expect(MarkFaceSlices.regionOf('noto-sans-latin-400')).toBeNull();
    expect((await MarkFaceSlices.sliceOf(real[3]!.file))!.id).toBe(real[3]!.id);
    expect(
      await MarkFaceSlices.sliceOf('noto-sans/files/noto-sans-latin-400-normal.woff'),
    ).toBeNull();
    expect(await MarkFaceSlices.sliceOf('noto-sans-jp/files/none.woff')).toBeNull();
  });
});
