import { describe, expect, it } from 'vitest';
import { isFindShortcut } from './find-shortcut';

const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('isFindShortcut', () => {
  it('is Ctrl F and Cmd F, whatever the case of the letter', () => {
    expect(isFindShortcut(key('f', { ctrlKey: true }))).toBe(true);
    expect(isFindShortcut(key('F', { metaKey: true }))).toBe(true);
  });

  it('is not F alone, nor with Shift or Alt', () => {
    expect(isFindShortcut(key('f'))).toBe(false);
    expect(isFindShortcut(key('f', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isFindShortcut(key('f', { metaKey: true, altKey: true }))).toBe(false);
  });
});
