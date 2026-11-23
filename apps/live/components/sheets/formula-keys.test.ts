import { describe, expect, it } from 'vitest';
import { formulaKey } from './formula-keys';

const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

// grid-and-editing.md "Editing", "Formulas"; keyboard-shortcuts.md "Formulas".
describe('formulaKey', () => {
  it('breaks the line with Alt+Enter everywhere, and Ctrl+Enter on a Mac', () => {
    expect(formulaKey(key('Enter', { altKey: true }), 'pc')).toBe('lineBreak');
    expect(formulaKey(key('Enter', { altKey: true }), 'mac')).toBe('lineBreak');
    expect(formulaKey(key('Enter', { ctrlKey: true }), 'mac')).toBe('lineBreak');
    expect(formulaKey(key('Enter', { ctrlKey: true }), 'pc')).toBeNull();
    expect(formulaKey(key('Enter', { metaKey: true }), 'mac')).toBeNull();
  });

  it('reads Ctrl+Shift+Enter, ⌘+Shift+Enter on a Mac, as array entry', () => {
    expect(formulaKey(key('Enter', { ctrlKey: true, shiftKey: true }), 'pc')).toBe('arrayEntry');
    expect(formulaKey(key('Enter', { metaKey: true, shiftKey: true }), 'mac')).toBe('arrayEntry');
    expect(formulaKey(key('Enter', { shiftKey: true }), 'pc')).toBeNull();
  });

  it('reads a bare F4 as the anchors, and leaves every other key', () => {
    expect(formulaKey(key('F4'), 'pc')).toBe('anchors');
    expect(formulaKey(key('F4', { altKey: true }), 'pc')).toBeNull();
    expect(formulaKey(key('F4', { ctrlKey: true }), 'pc')).toBeNull();
    expect(formulaKey(key('Enter'), 'pc')).toBeNull();
    expect(formulaKey(key('a'), 'pc')).toBeNull();
  });
});
