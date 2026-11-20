// docs/specs/034-text-documents/editing-surface.md "The page in the dark scheme".
import { describe, expect, it } from 'vitest';
import { contrastRatio, hexOklch } from '@livedoc/document';
import {
  DARK_PAPER,
  fillOnDarkPaper,
  inkOnDarkPaper,
  paperFill,
  paperInk,
} from './text-document-paper';

const lightness = (hex: string) => hexOklch(hex)!.l;
const hue = (hex: string) => hexOklch(hex)!.h;

describe('inkOnDarkPaper', () => {
  it('draws black near white and a dark colour lighter in its hue, each reading at 4.5:1', () => {
    for (const ink of ['#000000', '#434343', '#cc0000', '#1155cc', '#38761d', '#666666']) {
      const drawn = inkOnDarkPaper(ink);
      expect(contrastRatio(drawn, DARK_PAPER)).toBeGreaterThanOrEqual(4.5);
      expect(lightness(drawn)).toBeGreaterThan(lightness(ink));
    }
    expect(lightness(inkOnDarkPaper('#000000'))).toBeGreaterThan(0.9);
    expect(Math.abs(hue(inkOnDarkPaper('#cc0000')) - hue('#cc0000'))).toBeLessThan(8);
  });

  it('draws a light colour as written', () => {
    expect(inkOnDarkPaper('#ffff00')).toBe('#ffff00');
    expect(inkOnDarkPaper('#ffffff')).toBe('#ffffff');
  });
});

describe('fillOnDarkPaper', () => {
  it('draws a pale fill dark in its hue, under ink that still reads', () => {
    for (const fill of ['#ffffff', '#fff2cc', '#d9ead3', '#ffff00', '#cfe2f3']) {
      const drawn = fillOnDarkPaper(fill);
      expect(lightness(drawn)).toBeLessThan(0.5);
      expect(contrastRatio('#e3e3e3', drawn)).toBeGreaterThanOrEqual(4.5);
    }
    expect(Math.abs(hue(fillOnDarkPaper('#fff2cc')) - hue('#fff2cc'))).toBeLessThan(10);
  });

  it('draws a dark fill as written', () => {
    expect(fillOnDarkPaper('#073763')).toBe('#073763');
  });
});

describe('paperInk and paperFill', () => {
  it('give the written colour on light paper and the drawn one on dark, as one CSS value', () => {
    expect(paperInk('#000000')).toBe(`light-dark(#000000, ${inkOnDarkPaper('#000000')})`);
    expect(paperFill('#fff2cc')).toBe(`light-dark(#fff2cc, ${fillOnDarkPaper('#fff2cc')})`);
  });

  it('pass on what is no colour of the model unchanged', () => {
    expect(paperInk('red; x')).toBe('red; x');
    expect(paperFill('transparent')).toBe('transparent');
  });
});
