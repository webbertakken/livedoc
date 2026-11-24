import { MARK_FACE_DATA } from '@livedoc/pdf-documents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addMarkFaces, facesStackOf, MARK_FACES_STACK } from './pdf-mark-faces';
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

afterEach(() => vi.unstubAllGlobals());

// marks.md "Laying out": the surface draws the mark faces too, from the same files, added once.
describe('the mark faces on the surface', () => {
  it('draws a mark in the mark faces, or in Helvetica', () => {
    // Each family once, in the order a character is looked for: Noto Sans first, the further scripts, then symbols
    // and emoji, then the browser's own.
    expect(MARK_FACES_STACK).toMatch(
      /^"LiveDoc Noto Sans", "LiveDoc Noto Sans Hebrew", "LiveDoc Noto Sans Arabic", .+, "LiveDoc Noto Sans Symbols", "LiveDoc Noto Sans Symbols 2", "LiveDoc Noto Emoji", sans-serif$/,
    );
    expect(MARK_FACES_STACK.split(', ')).toHaveLength(23);
    expect(facesStackOf({ faces: 'noto' })).toBe(MARK_FACES_STACK);
    expect(facesStackOf({ faces: 'helvetica' })).toBe(TYPED_FACES);
  });

  it('adds every face once a page, each with its range and weight, from its file', () => {
    vi.stubGlobal('FontFace', FakeFontFace);
    const add = vi.fn();
    const fonts = { add } as unknown as FontFaceSet;
    addMarkFaces(fonts);
    addMarkFaces(fonts);
    expect(add).toHaveBeenCalledTimes(MARK_FACE_DATA.length);
    const [greek] = add.mock.calls
      .map(([face]) => face as FakeFontFace)
      .filter((face) => face.source.includes('noto-sans-greek-700-normal'));
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
});
