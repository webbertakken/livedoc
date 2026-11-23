import { describe, expect, it } from 'vitest';
import { isClipboardChord, sheetKey, type KeyLike } from './sheet-keys';

const k = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('the grid keys (sheet.md "Keyboard")', () => {
  it.each([
    [k('ArrowDown'), { kind: 'move', dir: 'down', jump: false, extend: false }],
    [k('ArrowLeft', { shiftKey: true }), { kind: 'move', dir: 'left', jump: false, extend: true }],
    [k('ArrowUp', { metaKey: true }), { kind: 'move', dir: 'up', jump: true, extend: false }],
    [
      k('ArrowRight', { ctrlKey: true, shiftKey: true }),
      { kind: 'move', dir: 'right', jump: true, extend: true },
    ],
    [k('Tab'), { kind: 'tab', back: false }],
    [k('Tab', { shiftKey: true }), { kind: 'tab', back: true }],
    [k('Enter'), { kind: 'enter', back: false }],
    [k('Enter', { shiftKey: true }), { kind: 'enter', back: true }],
    [k('F2'), { kind: 'edit' }],
    // data-validation.md "Using a dropdown": Alt+Down opens the active cell's dropdown.
    [k('ArrowDown', { altKey: true }), { kind: 'dropdown' }],
    [k('Home'), { kind: 'home', toSheet: false, extend: false }],
    [k('End', { ctrlKey: true }), { kind: 'end', toSheet: true, extend: false }],
    // grid-and-editing.md "Moving around": Shift grows the selection to where the move lands.
    [k('Home', { shiftKey: true }), { kind: 'home', toSheet: false, extend: true }],
    [k('End', { ctrlKey: true, shiftKey: true }), { kind: 'end', toSheet: true, extend: true }],
    [k('PageUp'), { kind: 'page', up: true, sideways: false, extend: false }],
    [k('PageDown'), { kind: 'page', up: false, sideways: false, extend: false }],
    [k('PageDown', { shiftKey: true }), { kind: 'page', up: false, sideways: false, extend: true }],
    [k('PageUp', { altKey: true }), { kind: 'page', up: true, sideways: true, extend: false }],
    [k('Backspace', { ctrlKey: true }), { kind: 'reveal' }],
    [k('Backspace', { metaKey: true }), { kind: 'reveal' }],
    [k('ArrowUp', { altKey: true }), { kind: 'sheet', step: -1 }],
    [k('PageUp', { ctrlKey: true, shiftKey: true }), { kind: 'sheet', step: -1 }],
    [k('PageDown', { ctrlKey: true, shiftKey: true }), { kind: 'sheet', step: 1 }],
    [k('Q', { altKey: true, shiftKey: true, code: 'KeyQ' }), { kind: 'summary' }],
    [k(' ', { ctrlKey: true, shiftKey: true }), { kind: 'selectAll' }],
    [k('M', { ctrlKey: true, altKey: true, shiftKey: true, code: 'KeyM' }), { kind: 'leave' }],
    [k('a', { metaKey: true }), { kind: 'selectAll' }],
    [k(' ', { shiftKey: true }), { kind: 'selectRow' }],
    [k(' ', { ctrlKey: true }), { kind: 'selectCol' }],
    [k('Delete'), { kind: 'clear' }],
    [k('Backspace'), { kind: 'clear' }],
    [k('b', { metaKey: true }), { kind: 'toggle', flag: 'b' }],
    [k('i', { ctrlKey: true }), { kind: 'toggle', flag: 'i' }],
    [k('u', { ctrlKey: true }), { kind: 'toggle', flag: 'u' }],
    [k('X', { ctrlKey: true, shiftKey: true }), { kind: 'toggle', flag: 'st' }],
    [k(';', { ctrlKey: true }), { kind: 'now', what: 'date' }],
    [k(':', { ctrlKey: true, shiftKey: true }), { kind: 'now', what: 'time' }],
    [k('f', { metaKey: true }), { kind: 'find', replace: false }],
    [k('h', { ctrlKey: true }), { kind: 'find', replace: true }],
    [k('H', { metaKey: true, shiftKey: true }), { kind: 'find', replace: true }],
    [k('d', { ctrlKey: true }), { kind: 'fill', dir: 'down' }],
    [k('r', { metaKey: true }), { kind: 'fill', dir: 'right' }],
    [
      k('!', { ctrlKey: true, shiftKey: true, code: 'Digit1' }),
      { kind: 'numberFormat', nf: 'number' },
    ],
    [
      k('$', { ctrlKey: true, shiftKey: true, code: 'Digit4' }),
      { kind: 'numberFormat', nf: 'currency' },
    ],
    [
      k('%', { ctrlKey: true, shiftKey: true, code: 'Digit5' }),
      { kind: 'numberFormat', nf: 'percent' },
    ],
    [k('Escape'), { kind: 'escape' }],
    [k('ContextMenu'), { kind: 'menu' }],
    [k('F10', { shiftKey: true }), { kind: 'menu' }],
    // keyboard-shortcuts.md: Context menu, Paste values only, Move focus out on a Mac.
    [k('|', { ctrlKey: true, shiftKey: true, code: 'Backslash' }), { kind: 'menu' }],
    [k('|', { metaKey: true, shiftKey: true, code: 'Backslash' }), { kind: 'menu' }],
    [k('V', { ctrlKey: true, shiftKey: true }), { kind: 'pasteValues' }],
    [k('v', { metaKey: true, shiftKey: true }), { kind: 'pasteValues' }],
    [k('M', { ctrlKey: true, metaKey: true, shiftKey: true, code: 'KeyM' }), { kind: 'leave' }],
    [k('x'), { kind: 'type', text: 'x' }],
    [k('='), { kind: 'type', text: '=' }],
  ])('%j', (e, cmd) => {
    expect(sheetKey(e)).toEqual(cmd);
  });
  it('leaves undo, redo and copy to others', () => {
    expect(sheetKey(k('z', { metaKey: true }))).toBeNull();
    expect(sheetKey(k('y', { ctrlKey: true }))).toBeNull();
    expect(sheetKey(k('c', { ctrlKey: true }))).toBeNull();
    expect(sheetKey(k('Backspace', { ctrlKey: true, shiftKey: true }))).toBeNull();
    // The browser's own: switching its tabs.
    expect(sheetKey(k('PageDown', { ctrlKey: true }))).toBeNull();
    expect(
      sheetKey(k('Q', { altKey: true, shiftKey: true, metaKey: true, code: 'KeyQ' })),
    ).toBeNull();
    expect(sheetKey(k('Shift'))).toBeNull();
    expect(sheetKey(k('x', { altKey: true }))).toBeNull();
  });

  it('types a character composed with Alt, and still not a bare Alt+letter', () => {
    // A Mac's Option: ⌥3 is £ on a UK layout, ⌥⇧2 is €, ⌥e then a vowel is é. They were dropped as shortcuts.
    expect(sheetKey(k('£', { altKey: true, code: 'Digit3' }))).toEqual({ kind: 'type', text: '£' });
    expect(sheetKey(k('€', { altKey: true, shiftKey: true, code: 'Digit2' }))).toEqual({
      kind: 'type',
      text: '€',
    });
    // AltGr on Windows comes as Ctrl+Alt: € is AltGr+E and @ is AltGr+Q on a German layout.
    const altGr = {
      ctrlKey: true,
      altKey: true,
      getModifierState: (m: 'AltGraph') => m === 'AltGraph',
    };
    expect(sheetKey(k('€', { ...altGr, code: 'KeyE' }))).toEqual({ kind: 'type', text: '€' });
    expect(sheetKey(k('@', { ...altGr, code: 'KeyQ' }))).toEqual({ kind: 'type', text: '@' });
    // AltGr's Ctrl is not a Ctrl: AltGr+B types (a { on some layouts), it does not bold.
    expect(sheetKey(k('{', { ...altGr, code: 'KeyB' }))).toEqual({ kind: 'type', text: '{' });
    // A bare Alt+letter or Alt+digit keeps its own character: a chord, not typing.
    expect(sheetKey(k('d', { altKey: true, code: 'KeyD' }))).toBeNull();
    expect(sheetKey(k('3', { altKey: true, code: 'Digit3' }))).toBeNull();
  });
});

// grid-and-editing.md "Accessibility": Read Row and Read Column, by the key's place, as Option+Shift types a symbol.
describe('Read Row and Read Column', () => {
  it('reads with Ctrl+Alt+Shift, or Option+Shift on a Mac, R a row and C a column', () => {
    const mods = { ctrlKey: true, altKey: true, shiftKey: true };
    expect(sheetKey({ ...k('R', mods), code: 'KeyR' })).toEqual({ kind: 'read', axis: 'r' });
    expect(sheetKey({ ...k('Ç', { altKey: true, shiftKey: true }), code: 'KeyC' })).toEqual({
      kind: 'read',
      axis: 'c',
    });
  });

  it('reads ⌘+Option+Shift on a Mac too, as Google gives it', () => {
    expect(
      sheetKey({ ...k('‰', { metaKey: true, altKey: true, shiftKey: true }), code: 'KeyR' }),
    ).toEqual({ kind: 'read', axis: 'r' });
  });

  it('leaves AltGr and other keys alone', () => {
    const altGr = { getModifierState: (m: 'AltGraph') => m === 'AltGraph' };
    expect(
      sheetKey({
        ...k('®', { ctrlKey: true, altKey: true, shiftKey: true }),
        code: 'KeyR',
        ...altGr,
      }),
    ).not.toEqual({ kind: 'read', axis: 'r' });
    expect(sheetKey({ ...k('X', { altKey: true, shiftKey: true }), code: 'KeyX' })?.kind).not.toBe(
      'read',
    );
  });
});

// keyboard-shortcuts.md "Navigate the spreadsheet": a MacBook's Option+Left and Option+Right step sheets; on a PC
// Alt+Left and Alt+Right are the browser's Back and Forward, left to it.
describe('Option+Left and Option+Right', () => {
  it('step sheets on a Mac only', () => {
    expect(sheetKey(k('ArrowRight', { altKey: true }), 'mac')).toEqual({ kind: 'sheet', step: 1 });
    expect(sheetKey(k('ArrowLeft', { altKey: true }), 'mac')).toEqual({ kind: 'sheet', step: -1 });
    expect(sheetKey(k('ArrowRight', { altKey: true }), 'pc')).toBeNull();
    expect(sheetKey(k('ArrowRight', { altKey: true }))).toBeNull();
    expect(sheetKey(k('ArrowLeft', { altKey: true, shiftKey: true }), 'mac')).toBeNull();
    expect(sheetKey(k('ArrowLeft', { altKey: true, metaKey: true }), 'mac')).toBeNull();
  });
});

// grid-and-editing.md "Formulas": F4 outside an edit redoes, as Google's does; Alt+F4 is the window's.
describe('F4', () => {
  it('redoes, bare only', () => {
    expect(sheetKey(k('F4'))).toEqual({ kind: 'redo' });
    expect(sheetKey(k('F4', { altKey: true }))).toBeNull();
    expect(sheetKey(k('F4', { ctrlKey: true }))).toBeNull();
    expect(sheetKey(k('F4', { shiftKey: true }))).toBeNull();
  });
});

// sheet.md "Clipboard": the browser's clipboard keys, kept from the editor's chords.
describe('isClipboardChord', () => {
  it('reads Ctrl or ⌘ with C, X or V, and nothing else', () => {
    expect(isClipboardChord(k('c', { ctrlKey: true }))).toBe(true);
    expect(isClipboardChord(k('X', { metaKey: true }))).toBe(true);
    expect(isClipboardChord(k('v', { ctrlKey: true }))).toBe(true);
    expect(isClipboardChord(k('v', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isClipboardChord(k('c', { ctrlKey: true, altKey: true }))).toBe(false);
    expect(isClipboardChord(k('c'))).toBe(false);
    expect(isClipboardChord(k('b', { ctrlKey: true }))).toBe(false);
  });
});
