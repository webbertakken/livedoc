// Pasted CSS as a cell's formats (grid-and-editing.md "Clipboard", D153).
import { describe, expect, it } from 'vitest';
import {
  colourOf,
  declarations,
  excelClassStyles,
  excelNumberFormat,
  formatFromStyle,
} from './clipboard-style';

const none = new Set<string>();

describe('colourOf', () => {
  it('reads hex, rgb and a few names', () => {
    expect(colourOf('#ABC')).toBe('#aabbcc');
    expect(colourOf('rgb(255, 0, 300)')).toBe('#ff00ff');
    expect(colourOf('WindowText')).toBe('#000000');
    expect(colourOf('teal')).toBeUndefined();
  });
});

describe('declarations', () => {
  it('splits at semicolons outside quotes and escapes', () => {
    expect(declarations(`a:1; mso-number-format:"0\\.00\\;\\[Red\\]"; b : 'x;y';bad;`)).toEqual([
      ['a', '1'],
      ['mso-number-format', '"0\\.00\\;\\[Red\\]"'],
      ['b', "'x;y'"],
    ]);
    expect(declarations('x:\\')).toEqual([['x', '\\']]);
  });
});

describe('excelClassStyles', () => {
  it('reads class rules from the style blocks, not element rules', () => {
    const html = `<style><!--td {font-size:11pt} .xl65, td.XL66 {font-weight:700} --></style><style>.a{x:1}</style>`;
    expect([...excelClassStyles(html)]).toEqual([
      ['xl65', 'font-weight:700'],
      ['xl66', 'font-weight:700'],
      ['a', 'x:1'],
    ]);
    expect([...excelClassStyles('<style>table .xl1 {a:1} .xl2 {b:2}')]).toEqual([['xl2', 'b:2']]);
    expect([...excelClassStyles('<style')]).toEqual([]);
  });
});

describe('excelNumberFormat', () => {
  it('reads named formats, codes and text', () => {
    expect(excelNumberFormat('"\\@"')).toEqual({ nf: 'text' });
    expect(excelNumberFormat('Percent')).toEqual({ nf: 'percent' });
    expect(excelNumberFormat('"Short Date"')).toEqual({ nf: 'date' });
    expect(excelNumberFormat('"0\\.00"')).toEqual({ nf: 'custom', nc: '0.00' });
    expect(excelNumberFormat('General')).toBeUndefined();
    expect(excelNumberFormat('""')).toBeUndefined();
    expect(excelNumberFormat('"0;0;0;0;0"')).toBeUndefined();
  });
});

describe('formatFromStyle', () => {
  it('reads what Google writes inline', () => {
    expect(
      formatFromStyle(
        'font-weight:bold;font-style:italic;text-decoration:underline line-through;color:#ff0000;' +
          'background-color:#00ff00;text-align:center;vertical-align:top;font-size:14pt;' +
          'border-top:1px solid #000000;border-right:2px dashed #cc0000;border-bottom:3px dotted #0000ff',
        none,
      ),
    ).toEqual({
      b: true,
      i: true,
      u: true,
      st: true,
      fc: '#ff0000',
      bg: '#00ff00',
      ha: 'c',
      va: 't',
      fs: 14,
      bt: { w: 1, s: 'solid', c: '#000000' },
      br: { w: 2, s: 'dashed', c: '#cc0000' },
      bb: { w: 3, s: 'dotted', c: '#0000ff' },
    });
  });

  it('reads Excel’s borders, sizes and number formats, and leaves defaults out', () => {
    expect(
      formatFromStyle(
        'border:.5pt solid windowtext;border-left:none;font-size:16px;font-weight:700;' +
          'mso-number-format:Percent;vertical-align:middle;text-align:left;color:#000000;background:#ffffff',
        none,
      ),
    ).toEqual({
      bt: { w: 1, s: 'solid', c: '#000000' },
      br: { w: 1, s: 'solid', c: '#000000' },
      bb: { w: 1, s: 'solid', c: '#000000' },
      b: true,
      fs: 12,
      nf: 'percent',
      va: 'm',
      ha: 'l',
    });
    expect(
      formatFromStyle(
        'vertical-align:bottom;font-size:200pt;text-align:right;border-top:3pt double red;' +
          'border-left:1px;font-size:1em;mso-number-format:General;font-weight:400',
        none,
      ),
    ).toEqual({ fs: 96, ha: 'r', bt: { w: 3, s: 'solid', c: '#ff0000' } });
    expect(formatFromStyle('font-size:2pt;border-right:solid', none)).toEqual({
      fs: 6,
      br: { w: 1, s: 'solid', c: '#000000' },
    });
  });

  it('reads formatting tags, and gives nothing for no formats', () => {
    expect(formatFromStyle('', new Set(['strong', 'em', 'u', 'del']))).toEqual({
      b: true,
      i: true,
      u: true,
      st: true,
    });
    expect(formatFromStyle('', new Set(['b', 'i', 's']))).toEqual({ b: true, i: true, st: true });
    expect(formatFromStyle('', new Set(['strike']))).toEqual({ st: true });
    expect(formatFromStyle('color:teal', none)).toBeUndefined();
  });
});
