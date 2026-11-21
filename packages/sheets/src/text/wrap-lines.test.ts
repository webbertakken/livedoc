import { describe, expect, it } from 'vitest';
import { textWidth } from './text-measure';
import { wrapLines } from './wrap-lines';

const PX = 13;
const wrap = (text: string, room: number, max?: number) => wrapLines(text, room, PX, {}, max);
const fits = (lines: readonly string[], room: number) =>
  lines.every((line) => textWidth(line.trimEnd(), PX) <= room);

// docs/specs/029-sheets/sheet.md "Row height": a cell that wraps breaks its text in the room its column gives.
describe('wrapLines', () => {
  it('keeps text that fits on one line', () => {
    expect(wrap('Budget', 200)).toEqual(['Budget']);
    expect(wrap('', 200)).toEqual(['']);
  });

  it('breaks at spaces, each line within the room, losing no word', () => {
    const text = 'The quick brown fox jumps over the lazy dog and keeps on running';
    const lines = wrap(text, 112);
    expect(lines.length).toBeGreaterThan(2);
    expect(fits(lines, 112)).toBe(true);
    expect(lines.join(' ')).toBe(text);
  });

  it('fills each line as far as it goes: the next word would not have fitted', () => {
    const text = 'aa bb cc dd ee ff gg hh';
    const lines = wrap(text, 60);
    const words = text.split(' ');
    let at = 0;
    for (const line of lines.slice(0, -1)) {
      at += line.split(' ').length;
      expect(textWidth(`${line} ${words[at]}`, PX)).toBeGreaterThan(60);
    }
  });

  it('starts a line at every line break, keeping blank lines', () => {
    expect(wrap('one\ntwo\n\nfour', 200)).toEqual(['one', 'two', '', 'four']);
    expect(wrap('one\r\ntwo', 200)).toEqual(['one', 'two']);
  });

  it('drops the spaces a break falls on and keeps the ones inside a line', () => {
    const lines = wrap('alpha    beta', textWidth('alpha', PX) + 2);
    expect(lines).toEqual(['alpha', 'beta']);
    expect(wrap('a  b', 200)).toEqual(['a  b']);
    expect(wrap('  indented', 200)).toEqual(['  indented']);
  });

  it('breaks a word wider than the room inside the word', () => {
    const lines = wrap('https://example.com/a/very/long/path/that/never/ends', 80);
    expect(lines.length).toBeGreaterThan(2);
    expect(fits(lines, 80)).toBe(true);
    expect(lines.join('')).toBe('https://example.com/a/very/long/path/that/never/ends');
  });

  it('breaks after a hyphen and between CJK characters', () => {
    expect(wrap('long-running', textWidth('running', PX) + 2)).toEqual(['long-', 'running']);
    const cjk = wrap('漢字漢字漢字', PX * 2 + 1);
    expect(cjk).toEqual(['漢字', '漢字', '漢字']);
  });

  it('never splits a surrogate pair or a letter from its mark', () => {
    const emoji = wrap('😀😀😀', 1);
    expect(emoji).toEqual(['😀', '😀', '😀']);
    expect(wrap('e\u0301e\u0301', 1)).toEqual(['e\u0301', 'e\u0301']);
  });

  it('gives one character a line when there is no room at all', () => {
    expect(wrap('abc', 0)).toEqual(['a', 'b', 'c']);
    expect(wrap('abc', -5)).toEqual(['a', 'b', 'c']);
  });

  it('stops at the most lines asked for', () => {
    expect(wrap('a b c d e f', 1, 3)).toEqual(['a', 'b', 'c']);
    expect(wrap('one\ntwo\nthree', 200, 2)).toEqual(['one', 'two']);
  });

  it('measures in the face given: bold and a wider font break sooner', () => {
    const text = 'Quarterly revenue forecast';
    const room = textWidth(text, PX) + 1;
    expect(wrapLines(text, room, PX, {})).toHaveLength(1);
    expect(wrapLines(text, room, PX, { bold: true }).length).toBeGreaterThan(1);
    expect(wrapLines(text, room, PX, { font: 'roboto-mono' }).length).toBeGreaterThan(1);
  });
});
