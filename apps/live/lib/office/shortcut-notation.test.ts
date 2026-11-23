import { describe, expect, it } from 'vitest';
import { formatShortcut, parseShortcut, shortcutTextOf } from './shortcut-notation';

// docs/specs/034-text-documents/keyboard-shortcuts.md "Notation".
describe('parseShortcut', () => {
  it('reads keys held together', () => {
    expect(parseShortcut('Ctrl+Shift+V')).toEqual([
      { steps: [{ mods: ['ctrl', 'shift'], code: 'KeyV' }] },
    ]);
  });

  it('reads a Mac shortcut, ⌘ and Option as meta and alt', () => {
    expect(parseShortcut('⌘+Option+Shift+Z')).toEqual([
      { steps: [{ mods: ['alt', 'shift', 'meta'], code: 'KeyZ' }] },
    ]);
  });

  it('reads several ways and the browser each holds in', () => {
    expect(parseShortcut('Alt+F (Chrome) or Alt+Shift+F (other browsers)')).toEqual([
      { steps: [{ mods: ['alt'], code: 'KeyF' }], browser: 'chrome' },
      { steps: [{ mods: ['alt', 'shift'], code: 'KeyF' }], browser: 'other' },
    ]);
  });

  it('reads a sequence: the modifiers held for both keys', () => {
    expect(parseShortcut('Ctrl+Alt+N, H')).toEqual([
      {
        steps: [
          { mods: ['ctrl', 'alt'], code: 'KeyN' },
          { mods: ['ctrl', 'alt'], code: 'KeyH' },
        ],
      },
    ]);
  });

  it('expands a range into one way per digit, each with its argument', () => {
    const ways = parseShortcut('Ctrl+Alt+[1-6]');
    expect(ways).toHaveLength(6);
    expect(ways[0]).toEqual({ steps: [{ mods: ['ctrl', 'alt'], code: 'Digit1' }], arg: '1' });
    expect(ways[5]?.arg).toBe('6');
    expect(parseShortcut('Ctrl+⌘+N, [1-6]')[2]).toEqual({
      steps: [
        { mods: ['ctrl', 'meta'], code: 'KeyN' },
        { mods: ['ctrl', 'meta'], code: 'Digit3' },
      ],
      arg: '3',
    });
  });

  it('reads punctuation and named keys by their code', () => {
    const code = (text: string) => parseShortcut(text)[0]?.steps[0]?.code;
    expect(code('Ctrl+/')).toBe('Slash');
    expect(code('Ctrl+\\')).toBe('Backslash');
    expect(code('Ctrl+]')).toBe('BracketRight');
    expect(code('Ctrl+[')).toBe('BracketLeft');
    expect(code('Ctrl+.')).toBe('Period');
    expect(code('Ctrl+,')).toBe('Comma');
    expect(code("Ctrl+'")).toBe('Quote');
    expect(code('Ctrl+;')).toBe('Semicolon');
    expect(code('Ctrl+-')).toBe('Minus');
    expect(code('Alt+Shift+~')).toBe('Backquote');
    expect(code('Ctrl+Plus')).toBe('Equal');
    expect(code('Ctrl+Space')).toBe('Space');
    expect(code('Shift+Esc')).toBe('Escape');
    expect(code('Ctrl+Shift+PgDn')).toBe('PageDown');
    expect(code('Shift+F10')).toBe('F10');
    expect(code('Alt+Up')).toBe('ArrowUp');
    expect(code('Alt+Enter')).toBe('Enter');
    expect(code('Ctrl+Backspace')).toBe('Backspace');
    expect(code('Ctrl+Alt+=')).toBe('Equal');
    for (const f of ['F1', 'F2', 'F4', 'F9', 'F11']) expect(code(`Shift+${f}`)).toBe(f);
  });

  it('keeps how = is written, on the key Plus names too', () => {
    expect(parseShortcut('Ctrl+Alt+=')[0]?.steps[0]).toEqual({
      mods: ['ctrl', 'alt'],
      code: 'Equal',
      label: '=',
    });
  });

  it('reads Fn with an F-key a Mac row names', () => {
    for (const f of ['F1', 'F4', 'F9', 'F11'])
      expect(parseShortcut(`Shift+Fn+${f}`)[0]?.steps[0]).toEqual({ mods: ['shift'], code: f });
  });

  it('reads Fn with an arrow as the key it makes on a Mac', () => {
    expect(parseShortcut('Shift+Fn+Left')).toEqual([
      { steps: [{ mods: ['shift'], code: 'Home' }] },
    ]);
    expect(parseShortcut('Fn+Down')[0]?.steps[0]?.code).toBe('PageDown');
    expect(parseShortcut('Fn+F7')[0]?.steps[0]).toEqual({ mods: [], code: 'F7' });
  });

  it('reads Search on ChromeOS as meta', () => {
    expect(parseShortcut('Ctrl+Search+Left')[0]?.steps[0]).toEqual({
      mods: ['ctrl', 'meta'],
      code: 'ArrowLeft',
    });
  });

  it('reads a single key with no modifier', () => {
    expect(parseShortcut('R')).toEqual([{ steps: [{ mods: [], code: 'KeyR' }] }]);
  });

  it('reads pointer gestures as pointer ways, never keys', () => {
    expect(parseShortcut('Double-click+drag')).toEqual([
      { steps: [], pointer: 'Double-click+drag' },
    ]);
    expect(parseShortcut('Shift+right-click')).toEqual([
      { steps: [], pointer: 'Shift+right-click' },
    ]);
  });

  it('reads — as no way at all', () => {
    expect(parseShortcut('—')).toEqual([]);
  });

  it('refuses what the notation does not hold', () => {
    expect(() => parseShortcut('Ctrl+Banana')).toThrow(/Banana/);
    expect(() => parseShortcut('Ctrl+')).toThrow();
  });
});

describe('formatShortcut', () => {
  it('writes a PC shortcut with plus signs', () => {
    expect(formatShortcut(parseShortcut('Ctrl+Shift+Z')[0]!, 'pc')).toBe('Ctrl+Shift+Z');
    expect(formatShortcut(parseShortcut('Ctrl+Alt+[1-6]')[1]!, 'pc')).toBe('Ctrl+Alt+2');
  });

  it("writes a Mac shortcut in Apple's symbols and order", () => {
    expect(formatShortcut(parseShortcut('⌘+Option+Shift+Z')[0]!, 'mac')).toBe('⌥⇧⌘Z');
    expect(formatShortcut(parseShortcut('Ctrl+Option+F')[0]!, 'mac')).toBe('⌃⌥F');
    expect(formatShortcut(parseShortcut('⌘+/')[0]!, 'mac')).toBe('⌘/');
  });

  it('writes a sequence as its first press, then the second key', () => {
    expect(formatShortcut(parseShortcut('Ctrl+Alt+N, H')[0]!, 'pc')).toBe('Ctrl+Alt+N H');
    expect(formatShortcut(parseShortcut('Ctrl+⌘+N, H')[0]!, 'mac')).toBe('⌃⌘N H');
  });

  it('writes named keys by name', () => {
    expect(formatShortcut(parseShortcut('Ctrl+Enter')[0]!, 'pc')).toBe('Ctrl+Enter');
    expect(formatShortcut(parseShortcut('Ctrl+Shift+Up')[0]!, 'pc')).toBe('Ctrl+Shift+↑');
    expect(formatShortcut(parseShortcut('Ctrl+Plus')[0]!, 'pc')).toBe('Ctrl++');
    expect(formatShortcut(parseShortcut('Ctrl+Alt+=')[0]!, 'pc')).toBe('Ctrl+Alt+=');
    expect(formatShortcut(parseShortcut('⌘+Option+=')[0]!, 'mac')).toBe('⌥⌘=');
    expect(formatShortcut(parseShortcut('Ctrl+Alt+N, =')[0]!, 'pc')).toBe('Ctrl+Alt+N =');
    expect(formatShortcut(parseShortcut('Ctrl+Backspace')[0]!, 'pc')).toBe('Ctrl+Backspace');
    expect(formatShortcut(parseShortcut('Ctrl+Search+Left')[0]!, 'chromeos')).toBe('Ctrl+Search+←');
  });

  it('writes a pointer way as its gesture', () => {
    expect(formatShortcut(parseShortcut('Triple-click')[0]!, 'pc')).toBe('Triple-click');
  });
});

describe('shortcutTextOf', () => {
  const rows = [
    { id: 'redo', keys: { pc: 'Ctrl+Shift+Z', mac: '⌘+Shift+Z', chromeos: 'Ctrl+Shift+Z' } },
    {
      id: 'file',
      keys: {
        pc: 'Alt+F (Chrome) or Alt+Shift+F (other browsers)',
        mac: 'Ctrl+Option+F',
        chromeos: 'Alt+F',
      },
    },
    {
      id: 'next-heading',
      keys: { pc: 'Ctrl+Alt+N, H', mac: 'Ctrl+⌘+N, H', chromeos: 'Ctrl+Alt+N, H' },
    },
    { id: 'pc-only', keys: { pc: 'Ctrl+Shift+PgDn', mac: '—', chromeos: '—' } },
    { id: 'slash', keys: { pc: 'Ctrl+/', mac: '⌘+/', chromeos: 'Ctrl+/' } },
    { id: 'insert', keys: { pc: 'Ctrl+Alt+=', mac: '⌘+Option+=', chromeos: 'Ctrl+Alt+=' } },
  ];

  it("shows the platform's first way and names it for assistive technology", () => {
    const pc = shortcutTextOf(rows, { platform: 'pc', chrome: true });
    expect(pc('redo')).toEqual({ shown: 'Ctrl+Shift+Z', aria: 'Control+Shift+Z' });
    expect(pc('slash')).toEqual({ shown: 'Ctrl+/', aria: 'Control+/' });
    expect(pc('insert')).toEqual({ shown: 'Ctrl+Alt+=', aria: 'Control+Alt+=' });
    const mac = shortcutTextOf(rows, { platform: 'mac', chrome: true });
    expect(mac('redo')).toEqual({ shown: '⇧⌘Z', aria: 'Shift+Meta+Z' });
  });

  it('shows the way of this browser', () => {
    expect(shortcutTextOf(rows, { platform: 'pc', chrome: false })('file')?.shown).toBe(
      'Alt+Shift+F',
    );
    expect(shortcutTextOf(rows, { platform: 'pc', chrome: true })('file')?.shown).toBe('Alt+F');
  });

  it('shows a sequence, with no name ARIA can hold', () => {
    expect(shortcutTextOf(rows, { platform: 'pc', chrome: true })('next-heading')).toEqual({
      shown: 'Ctrl+Alt+N H',
      aria: '',
    });
  });

  it('shows nothing for a shortcut the platform has none of, or an unknown one', () => {
    const mac = shortcutTextOf(rows, { platform: 'mac', chrome: true });
    expect(mac('pc-only')).toBeNull();
    expect(mac('nope')).toBeNull();
  });
});
