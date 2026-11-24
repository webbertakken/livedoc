import { describe, expect, it } from 'vitest';
import { Mark } from '../mark';
import { MarkFaces } from '../mark-faces';
import { PageName } from '../page-name';
import { markFaceFiles, typesetterOf } from '../testing/fixtures';
import { FaceNotLoaded, loadTypesetter, markFacesOf } from './typesetter';

const typed = (words: string) =>
  Mark.text({
    id: 'a-text',
    page: PageName.ofObject(3),
    words,
    size: 12,
    colour: '#d93025',
    opacity: 1,
    author: 'Ada',
    createdAt: 0,
    rect: [72, 400, 300, 500],
  })!;

// marks.md "Laying out", "Loading".
describe('setting runs in the mark faces', () => {
  it('names no face for marks Helvetica writes, and each face the others use', () => {
    expect(
      markFacesOf([
        typed('Hello'),
        Mark.highlight({
          id: 'h',
          page: PageName.ofObject(3),
          quads: [[0, 0, 1, 0, 0, 1, 1, 1]],
          text: 'x',
          colour: '#fdf1a9',
          opacity: 1,
          author: 'Ada',
          createdAt: 0,
        })!,
      ]),
    ).toEqual(new Set());
    expect(markFacesOf([typed('Ω\nЖ')])).toEqual(
      new Set(['noto-sans-greek-400', 'noto-sans-cyrillic-400']),
    );
  });

  it('shapes a run into glyphs, each with the characters it was shaped from', async () => {
    const setter = await typesetterOf(['noto-sans-devanagari-400']);
    const run = { face: 'noto-sans-devanagari-400', text: 'नमस्ते' };
    const shaped = setter.shape(run, false);
    // The conjunct and the vowel sign join their letters: fewer glyphs than characters, every character kept.
    expect(shaped.glyphs.length).toBeLessThan(Array.from(run.text).length);
    expect(shaped.glyphs.map((glyph) => glyph.text).join('')).toBe(run.text);
    expect(shaped.width).toBeCloseTo(shaped.glyphs.reduce((sum, glyph) => sum + glyph.advance, 0));
    expect(setter.bytes).toBeGreaterThan(10_000);
    expect(setter.face('noto-sans-devanagari-400').metrics.unitsPerEm).toBe(1000);
  });

  it('sets a plain run about as wide as the table measures it, and a right-to-left run in visual order', async () => {
    const setter = await typesetterOf(['noto-sans-cyrillic-400']);
    const run = { face: 'noto-sans-cyrillic-400', text: 'Жук' };
    // Kerning draws its letters a little closer than the table's advances.
    const measured = MarkFaces.width({ text: 'Жук', bold: false });
    expect(setter.shape(run, false).width).toBeLessThanOrEqual(measured);
    expect(setter.shape(run, false).width).toBeGreaterThan(measured * 0.98);
    const forward = setter.shape(run, false).glyphs.map((glyph) => glyph.glyph);
    expect(setter.shape(run, true).glyphs.map((glyph) => glyph.glyph)).toEqual(forward.reverse());
  });

  it('answers the name of a face that does not load, or does not read', async () => {
    const failing = async () => {
      throw new Error('offline');
    };
    expect(await loadTypesetter(['noto-sans-greek-400'], failing)).toEqual({
      ok: false,
      face: 'noto-sans-greek-400',
    });
    expect(await loadTypesetter(['noto-sans-latin-400', 'no-such-face'], markFaceFiles)).toEqual({
      ok: false,
      face: 'no-such-face',
    });
    expect(await loadTypesetter(['noto-sans-greek-400'], async () => new Uint8Array(64))).toEqual({
      ok: false,
      face: 'noto-sans-greek-400',
    });
    const setter = await typesetterOf([]);
    expect(() => setter.face('noto-sans-greek-400')).toThrow(FaceNotLoaded);
  });
});
