// docs/specs/035-pdf-documents/marks.md "In the file": a line's and a shape's appearance stream is drawn from what the
// page shows of them (MarkDrawing), line for line, in the mark's colour and opacity.
import { describe, expect, it } from 'vitest';
import type { MarkRun } from '../mark-faces';
import {
  appearanceOf,
  defaultAppearanceOf,
  NoRunSetter,
  type RunSetter,
  winAnsiString,
} from './appearance';
import type { ShapedRun } from './typesetter';

const look = { colour: '#d93025', opacity: 1 };

describe('appearanceOf', () => {
  it('strokes each open line through its points in the mark’s colour and width', () => {
    const drawn = appearanceOf(
      {
        fills: [],
        strokes: [
          {
            points: [
              { x: 10, y: 20 },
              { x: 110.125, y: 20 },
            ],
            width: 3,
            round: false,
            closed: false,
          },
        ],
      },
      look,
    );
    expect(drawn.content).toBe(
      ['q', '0.853 0.19 0.147 RG', '3 w 0 J 0 j', '10 20 m 110.13 20 l S', 'Q'].join('\n'),
    );
    expect(drawn.opacity).toBeNull();
  });

  it('closes a closed line and rounds a round one', () => {
    const drawn = appearanceOf(
      {
        fills: [],
        strokes: [
          {
            points: [
              { x: 0, y: 0 },
              { x: 5, y: 0 },
              { x: 5, y: 5 },
            ],
            width: 1,
            round: false,
            closed: true,
          },
          {
            points: [
              { x: 1, y: 1 },
              { x: 2, y: 2 },
            ],
            width: 2,
            round: true,
            closed: false,
          },
        ],
      },
      look,
    );
    expect(drawn.content).toContain('1 w 0 J 0 j\n0 0 m 5 0 l 5 5 l h S');
    expect(drawn.content).toContain('2 w 1 J 1 j\n1 1 m 2 2 l S');
  });

  it('fills each closed outline', () => {
    const drawn = appearanceOf(
      {
        fills: [
          [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 4, y: 4 },
          ],
        ],
        strokes: [],
      },
      look,
    );
    expect(drawn.content).toBe(
      ['q', '0.853 0.19 0.147 rg', '0 0 m 4 0 l 4 4 l h f', 'Q'].join('\n'),
    );
  });

  it('names the opacity under 1, to be drawn through a graphics state', () => {
    const dot = { points: [{ x: 1, y: 1 }], width: 1, round: true, closed: false };
    const drawn = appearanceOf({ fills: [], strokes: [dot] }, { colour: '#000000', opacity: 0.5 });
    expect(drawn.opacity).toBe(0.5);
    expect(drawn.content).toBe(
      ['q', '/LDa gs', '0.002 0.002 0.002 RG', '1 w 1 J 1 j', '1 1 m S', 'Q'].join('\n'),
    );
  });

  // The box holds every line whole: a sharp corner reaches past a point by up to its line's width.
  it('boxes every point, grown by the widest line', () => {
    const drawn = appearanceOf(
      {
        fills: [],
        strokes: [
          {
            points: [
              { x: 10, y: 20 },
              { x: 110, y: 60 },
            ],
            width: 4,
            round: false,
            closed: false,
          },
        ],
      },
      look,
    );
    expect(drawn.box).toEqual([6, 16, 114, 64]);
  });
});

// marks.md "In the file": a Text's and a Callout's appearance sets its words line for line in Helvetica, a character
// Helvetica cannot write set as a question mark.
describe('words in an appearance', () => {
  const words = {
    lines: [
      { text: 'Hello (1)', width: 40, rtl: false, x: 102, y: 590.5, size: 12, bold: false },
      { text: '', width: 0, rtl: false, x: 102, y: 576, size: 12, bold: false },
      { text: 'café € \\ א', width: 30, rtl: false, x: 102, y: 561.6, size: 12, bold: false },
    ],
    box: [100, 550, 300, 600] as const,
    faces: 'helvetica' as const,
  };

  it('sets each line with words at its place, in the font at the size, in the mark’s colour', () => {
    const drawn = appearanceOf({ fills: [], strokes: [] }, look, words);
    expect(drawn.content).toBe(
      [
        'q',
        'BT',
        '/Helv 12 Tf 0.853 0.19 0.147 rg',
        '1 0 0 1 102 590.5 Tm (Hello \\(1\\)) Tj',
        '1 0 0 1 102 561.6 Tm (caf\\351 \\200 \\\\ ?) Tj',
        'ET',
        'Q',
      ].join('\n'),
    );
    expect(drawn.box).toEqual([100, 550, 300, 600]);
    expect(drawn.fonts).toEqual(['Helv']);
  });

  // marks.md "Stamps": the name in Helvetica Bold, the second line in Helvetica, each at its own size.
  it('sets each line in its face and size, naming the fonts it sets', () => {
    const drawn = appearanceOf({ fills: [], strokes: [] }, look, {
      lines: [
        { text: 'APPROVED', width: 90, rtl: false, x: 110, y: 620, size: 18, bold: true },
        { text: 'by Ada', width: 30, rtl: false, x: 140, y: 605, size: 8, bold: false },
      ],
      box: [100, 600, 220, 640],
      faces: 'helvetica',
    });
    expect(drawn.content).toBe(
      [
        'q',
        'BT',
        '/HeBo 18 Tf 0.853 0.19 0.147 rg',
        '1 0 0 1 110 620 Tm (APPROVED) Tj',
        '/Helv 8 Tf',
        '1 0 0 1 140 605 Tm (by Ada) Tj',
        'ET',
        'Q',
      ].join('\n'),
    );
    expect(drawn.fonts).toEqual(['HeBo', 'Helv']);
  });

  it('writes the font, size and colour as the file’s DA', () => {
    expect(defaultAppearanceOf(9.5, '#000000')).toBe('/Helv 9.5 Tf 0.002 0.002 0.002 rg');
  });

  it('writes WinAnsi bytes past ASCII in octal and escapes brackets and backslashes', () => {
    expect(winAnsiString('a(b)c\\d\u00a0“')).toBe('(a\\(b\\)c\\\\d\\240\\223)');
  });

  it('sets no words where every line is empty', () => {
    const drawn = appearanceOf({ fills: [], strokes: [] }, look, {
      ...words,
      lines: [words.lines[1]!],
    });
    expect(drawn.content).toBe('q\nQ');
  });
});

// marks.md "Words in every script": words in the mark faces set run by run, glyph by glyph, as shaping places them.
describe('appearanceOf, words in the mark faces', () => {
  const line = { text: 'Ωא', width: 30, rtl: false, x: 102, y: 590, size: 10, bold: false };
  const glyph = (id: number, advance: number, xOffset = 0, yOffset = 0) => ({
    glyph: id,
    advance,
    xOffset,
    yOffset,
    text: 'x',
  });
  /** A setter shaping each run as given, each glyph's own advance 500. */
  const setter = (shaped: Record<string, ShapedRun['glyphs']>): RunSetter => ({
    shape: ({ face }: MarkRun) => {
      const glyphs = shaped[face]!;
      return { face, glyphs, width: glyphs.reduce((sum, each) => sum + each.advance, 0) };
    },
    advance: () => 500,
  });
  const faced = (lines: (typeof line)[]) => ({
    lines,
    box: [100, 550, 300, 600] as const,
    faces: 'noto' as const,
  });

  it('sets each run in its face, moving a glyph where shaping moved it', () => {
    const drawn = appearanceOf(
      { fills: [], strokes: [] },
      look,
      faced([line]),
      setter({
        'noto-sans-greek-400': [glyph(5, 500), glyph(6, 450, 20)],
        'noto-sans-latin-400': [glyph(0, 600)],
      }),
    );
    expect(drawn.content).toBe(
      [
        'q',
        'BT',
        '0.853 0.19 0.147 rg',
        '100 Tz 1 0 0 1 102 590 Tm',
        '/LDf0 10 Tf',
        '[<0005> -20 <0006> 70] TJ',
        '/LDf1 10 Tf',
        '[<0000> -100] TJ',
        'ET',
        'Q',
      ].join('\n'),
    );
    expect(drawn.fonts).toEqual([]);
    expect(drawn.faces.map(({ name, face, glyphs }) => [name, face, glyphs.length])).toEqual([
      ['LDf0', 'noto-sans-greek-400', 2],
      ['LDf1', 'noto-sans-latin-400', 1],
    ]);
  });

  it('raises a glyph shaping raised, apart, and narrows a line shaped wider than measured', () => {
    const drawn = appearanceOf(
      { fills: [], strokes: [] },
      look,
      faced([{ ...line, text: 'Ω', width: 7.5 }]),
      setter({ 'noto-sans-greek-400': [glyph(5, 500), glyph(9, 0, -300, 250), glyph(5, 500)] }),
    );
    expect(drawn.content).toContain(
      [
        '75 Tz 1 0 0 1 102 590 Tm',
        '/LDf0 10 Tf',
        '[<0005>] TJ',
        '[300] TJ',
        '2.5 Ts',
        '[<0009>] TJ',
        '0 Ts',
        '[200 <0005>] TJ',
      ].join('\n'),
    );
  });

  it('names a face once however many of its runs a line holds', () => {
    const drawn = appearanceOf(
      { fills: [], strokes: [] },
      look,
      faced([{ ...line, text: 'ΩאΩ' }]),
      setter({ 'noto-sans-greek-400': [glyph(5, 500)], 'noto-sans-latin-400': [glyph(0, 500)] }),
    );
    expect(drawn.faces.map(({ name, glyphs }) => [name, glyphs.length])).toEqual([
      ['LDf0', 2],
      ['LDf1', 1],
    ]);
  });

  it('raises a first glyph with nothing set before it', () => {
    const drawn = appearanceOf(
      { fills: [], strokes: [] },
      look,
      faced([{ ...line, text: 'Ω' }]),
      setter({ 'noto-sans-greek-400': [glyph(9, 500, 0, 100)] }),
    );
    expect(drawn.content).toContain('/LDf0 10 Tf\n1 Ts\n[<0009>] TJ\n0 Ts\nET');
  });

  it('sets a right-to-left line from its right side, its runs in visual order', () => {
    const drawn = appearanceOf(
      { fills: [], strokes: [] },
      look,
      faced([{ ...line, rtl: true }]),
      setter({ 'noto-sans-greek-400': [glyph(5, 500)], 'noto-sans-latin-400': [glyph(0, 500)] }),
    );
    expect(drawn.content).toContain(
      '100 Tz 1 0 0 1 122 590 Tm\n/LDf0 10 Tf\n[<0000>] TJ\n/LDf1 10 Tf\n[<0005>] TJ',
    );
  });

  it('refuses words in the mark faces without a typesetter', () => {
    expect(() => appearanceOf({ fills: [], strokes: [] }, look, faced([line]))).toThrow(
      NoRunSetter,
    );
  });
});
