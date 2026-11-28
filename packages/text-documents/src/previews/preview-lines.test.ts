import { describe, expect, it } from 'vitest';
import { breakLines, textWidth, type Look, type Piece } from './preview-lines';

// docs/specs/034-text-documents/agents-and-sync.md "Page previews", "Lines".

const LOOK: Look = { size: 20, bold: false, italic: false };
const text = (t: string, look: Partial<Look> = {}): Piece => ({
  kind: 'text',
  text: t,
  look: { ...LOOK, ...look },
});
const words = (lines: ReturnType<typeof breakLines>) =>
  lines.map((l) => l.pieces.map((p) => (p.kind === 'text' ? p.text : '[box]')).join(''));

describe('textWidth', () => {
  it('adds the bundled face’s advances at the size, bold wider, and an unknown character at the fallback', () => {
    // Inter Regular’s space is 0.281 em.
    expect(textWidth(' ', 20, false)).toBeCloseTo(5.62, 2);
    expect(textWidth('m', 20, true)).toBeGreaterThan(textWidth('m', 20, false));
    expect(textWidth('中', 10, false)).toBeCloseTo(6, 5);
    expect(textWidth('\u0080', 10, false)).toBeCloseTo(6, 5);
  });
});

describe('textWidth by face', () => {
  it('reads a carried face’s own widths, and Inter’s for a face it does not carry', () => {
    const inter = textWidth('Mountain', 20, false);
    expect(textWidth('Mountain', 20, false, 'Arimo')).toBeLessThan(inter);
    expect(textWidth('Mountain', 20, false, 'Tinos')).toBeLessThan(
      textWidth('Mountain', 20, false, 'Arimo'),
    );
    expect(textWidth('Mountain', 20, false, 'Lobster')).toBe(inter);
  });
});

describe('breakLines', () => {
  it('breaks at spaces where the line fills, keeping the space with the word before', () => {
    const width = textWidth('alpha beta ', 20, false);
    const lines = breakLines([text('alpha beta gamma')], width, width);
    expect(words(lines)).toEqual(['alpha beta ', 'gamma']);
    expect(lines[0]!.width).toBeCloseTo(textWidth('alpha beta', 20, false), 5);
  });

  it('breaks after a hyphen, and inside a word wider than the line', () => {
    const narrow = textWidth('known', 20, false);
    expect(words(breakLines([text('well-known')], narrow, narrow))).toEqual(['well-', 'known']);
    const tiny = textWidth('ab', 20, false);
    expect(words(breakLines([text('abcde')], tiny, tiny))).toEqual(['ab', 'cd', 'e']);
  });

  it('starts a line at a line break, and draws a tab as four spaces', () => {
    expect(words(breakLines([text('one\ntwo')], 1000, 1000))).toEqual(['one', 'two']);
    expect(words(breakLines([text('a\tb')], 1000, 1000))).toEqual(['a    b']);
  });

  it('gives the first line its own width', () => {
    const first = textWidth('aaa ', 20, false);
    expect(words(breakLines([text('aaa bbb ccc')], first, 1000))).toEqual(['aaa ', 'bbb ccc']);
  });

  it('keeps runs of different looks as their own pieces on one line, and a box as one', () => {
    const lines = breakLines(
      [
        text('plain '),
        text('bold', { bold: true }),
        { kind: 'box', width: 30, height: 40, alt: 'cat' },
      ],
      1000,
      1000,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]!.pieces.map((p) => p.kind)).toEqual(['text', 'text', 'box']);
    expect(lines[0]!.pieces[1]!.x).toBeCloseTo(textWidth('plain ', 20, false), 5);
  });

  it('moves a box that does not fit to the next line', () => {
    const lines = breakLines(
      [text('ab '), { kind: 'box', width: 900, height: 40, alt: '' }],
      textWidth('ab ', 20, false) + 10,
      1000,
    );
    expect(lines).toHaveLength(2);
  });

  it('answers one empty line for no pieces, at the paragraph’s own size', () => {
    expect(breakLines([], 100, 100)).toEqual([{ pieces: [], width: 0 }]);
  });
});
