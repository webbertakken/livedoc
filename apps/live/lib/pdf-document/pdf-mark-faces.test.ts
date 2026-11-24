import { MARK_FACE_DATA, MarkFaceSlices } from '@livedoc/pdf-documents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addMarkFaces, facesStackOf, markFacesStack } from './pdf-mark-faces';
import { TYPED_FACES } from './pdf-typed';

/** The FontFace a browser makes, as the test needs it: what it was made with. */
class FakeFontFace {
  readonly family: string;
  readonly source: string;
  readonly descriptors: FontFaceDescriptors;
  constructor(family: string, source: string, descriptors: FontFaceDescriptors) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;
  }
}

const added = (add: ReturnType<typeof vi.fn>) =>
  add.mock.calls.map(([face]) => face as FakeFontFace);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// marks.md "Laying out": the surface draws the mark faces too, from the same files, added once; a mark in Chinese,
// Japanese or Korean in its region's family alone, its slices added the first time a mark in it is drawn.
describe('the mark faces on the surface', () => {
  it('draws a mark in the mark faces, its region alone before symbols, or in Helvetica', () => {
    // Each family once, in the order a character is looked for: Noto Sans first, the further scripts, the region,
    // then symbols and emoji, then the browser's own.
    expect(markFacesStack('jp')).toMatch(
      /^"LiveDoc Noto Sans", "LiveDoc Noto Sans Hebrew", "LiveDoc Noto Sans Arabic", .+, "LiveDoc Noto Sans JP", "LiveDoc Noto Sans Symbols", "LiveDoc Noto Sans Symbols 2", "LiveDoc Noto Emoji", sans-serif$/,
    );
    expect(markFacesStack('jp').split(', ')).toHaveLength(24);
    expect(markFacesStack('kr')).not.toContain('Noto Sans SC');
    expect(facesStackOf({ faces: 'noto', region: 'sc' })).toBe(markFacesStack('sc'));
    expect(facesStackOf({ faces: 'helvetica', region: 'sc' })).toBe(TYPED_FACES);
  });

  it('adds every face once a page, each with its range and weight, from its file', async () => {
    vi.stubGlobal('FontFace', FakeFontFace);
    const add = vi.fn();
    const fonts = { add } as unknown as FontFaceSet;
    await addMarkFaces(null, fonts);
    await addMarkFaces(null, fonts);
    expect(add).toHaveBeenCalledTimes(MARK_FACE_DATA.length);
    const [greek] = added(add).filter((face) => face.source.includes('noto-sans-greek-700-normal'));
    expect(greek).toMatchObject({
      family: 'LiveDoc Noto Sans',
      descriptors: {
        weight: '700',
        display: 'swap',
        unicodeRange: expect.stringContaining('U+0370'),
      },
    });
    expect(greek!.source).toMatch(/^url\(".+\.woff"\) format\("woff"\)$/);
  });

  it('adds a region slices once, the first time a mark in it is drawn', async () => {
    vi.stubGlobal('FontFace', FakeFontFace);
    const add = vi.fn();
    const fonts = { add } as unknown as FontFaceSet;
    await addMarkFaces('kr', fonts);
    await addMarkFaces('kr', fonts);
    const slices = await MarkFaceSlices.load('kr');
    expect(add).toHaveBeenCalledTimes(MARK_FACE_DATA.length + slices.length);
    const korean = added(add).filter((face) => face.family === 'LiveDoc Noto Sans KR');
    expect(korean).toHaveLength(slices.length);
    expect(korean[0]!.descriptors).toMatchObject({ weight: '400', unicodeRange: slices[0]!.range });
  });

  it('tries a region again where its slices did not load', async () => {
    vi.stubGlobal('FontFace', FakeFontFace);
    const add = vi.fn();
    const fonts = { add } as unknown as FontFaceSet;
    const load = vi.spyOn(MarkFaceSlices, 'load').mockRejectedValueOnce(new Error('offline'));
    await addMarkFaces('sc', fonts);
    expect(added(add).some((face) => face.family === 'LiveDoc Noto Sans SC')).toBe(false);
    await addMarkFaces('sc', fonts);
    expect(load).toHaveBeenCalledTimes(2);
    expect(added(add).some((face) => face.family === 'LiveDoc Noto Sans SC')).toBe(true);
  });
});
