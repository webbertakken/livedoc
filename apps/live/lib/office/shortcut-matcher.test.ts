import { describe, expect, it } from 'vitest';
import { createShortcutMatcher, type ShortcutKey } from './shortcut-matcher';
import { isChromeBrowser, officePlatformOf } from './office-platform';

const press = (code: string, mods: Partial<Omit<ShortcutKey, 'code'>> = {}): ShortcutKey => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

const ROWS = [
  { id: 'undo', keys: { pc: 'Ctrl+Z', mac: '⌘+Z', chromeos: 'Ctrl+Z' } },
  {
    id: 'menu-file',
    keys: {
      pc: 'Alt+F (Chrome) or Alt+Shift+F (other browsers)',
      mac: 'Ctrl+Option+F',
      chromeos: 'Alt+F',
    },
  },
  {
    id: 'heading',
    keys: { pc: 'Ctrl+Alt+[1-6]', mac: '⌘+Option+[1-6]', chromeos: 'Ctrl+Alt+[1-6]' },
  },
  {
    id: 'next-heading',
    keys: { pc: 'Ctrl+Alt+N, H', mac: 'Ctrl+⌘+N, H', chromeos: 'Ctrl+Alt+N, H' },
  },
  {
    id: 'comment-history',
    keys: { pc: 'Ctrl+Alt+Shift+A', mac: '⌘+Option+Shift+A', chromeos: 'Ctrl+Alt+Shift+A' },
  },
  {
    id: 'verbalize-cursor',
    keys: { pc: 'Ctrl+Alt+Shift+A, L', mac: 'Ctrl+⌘+A, L', chromeos: 'Ctrl+Alt+Shift+A, L' },
  },
  {
    id: 'select-word',
    keys: { pc: 'Double-click', mac: 'Double-click', chromeos: 'Double-click' },
  },
  { id: 'none-here', keys: { pc: '—', mac: '⌘+Down', chromeos: '—' } },
];

// docs/specs/004-interface-design/office-shell.md "Shortcut layer".
describe('createShortcutMatcher', () => {
  it('matches a press with exactly its modifiers', () => {
    const m = createShortcutMatcher(ROWS, { platform: 'pc', chrome: true });
    expect(m.keydown(press('KeyZ', { ctrlKey: true }))).toEqual({ id: 'undo' });
    expect(m.keydown(press('KeyZ', { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(m.keydown(press('KeyZ'))).toBeNull();
  });

  it("reads the platform's own keys", () => {
    const mac = createShortcutMatcher(ROWS, { platform: 'mac', chrome: true });
    expect(mac.keydown(press('KeyZ', { metaKey: true }))).toEqual({ id: 'undo' });
    expect(mac.keydown(press('KeyZ', { ctrlKey: true }))).toBeNull();
    expect(mac.keydown(press('ArrowDown', { metaKey: true }))).toEqual({ id: 'none-here' });
  });

  it('holds a way to the browser it is written for', () => {
    const chrome = createShortcutMatcher(ROWS, { platform: 'pc', chrome: true });
    expect(chrome.keydown(press('KeyF', { altKey: true }))).toEqual({ id: 'menu-file' });
    expect(chrome.keydown(press('KeyF', { altKey: true, shiftKey: true }))).toBeNull();
    const firefox = createShortcutMatcher(ROWS, { platform: 'pc', chrome: false });
    expect(firefox.keydown(press('KeyF', { altKey: true }))).toBeNull();
    expect(firefox.keydown(press('KeyF', { altKey: true, shiftKey: true }))).toEqual({
      id: 'menu-file',
    });
  });

  it("passes a range's digit as the argument", () => {
    const m = createShortcutMatcher(ROWS, { platform: 'pc', chrome: true });
    expect(m.keydown(press('Digit3', { ctrlKey: true, altKey: true }))).toEqual({
      id: 'heading',
      arg: '3',
    });
  });

  it('runs a sequence on its second key, and waits on the first', () => {
    const m = createShortcutMatcher(ROWS, { platform: 'pc', chrome: true });
    expect(m.keydown(press('KeyN', { ctrlKey: true, altKey: true }))).toBe('pending');
    expect(m.keydown(press('KeyH', { ctrlKey: true, altKey: true }))).toEqual({
      id: 'next-heading',
    });
  });

  it('ends a sequence on any other key, which then counts afresh', () => {
    const m = createShortcutMatcher(ROWS, { platform: 'pc', chrome: true });
    expect(m.keydown(press('KeyN', { ctrlKey: true, altKey: true }))).toBe('pending');
    expect(m.keydown(press('KeyZ', { ctrlKey: true }))).toEqual({ id: 'undo' });
    expect(m.keydown(press('KeyH', { ctrlKey: true, altKey: true }))).toBeNull();
  });

  it('ends a sequence when the modifiers are let go', () => {
    const m = createShortcutMatcher(ROWS, { platform: 'pc', chrome: true });
    m.keydown(press('KeyN', { ctrlKey: true, altKey: true }));
    expect(m.keyup(press('ControlLeft', { altKey: true }))).toBeNull();
    expect(m.keydown(press('KeyH', { ctrlKey: true, altKey: true }))).toBeNull();
  });

  it('lets a modifier pressed alone through without ending a sequence', () => {
    const m = createShortcutMatcher(ROWS, { platform: 'pc', chrome: true });
    m.keydown(press('KeyN', { ctrlKey: true, altKey: true }));
    expect(m.keydown(press('AltLeft', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(m.keydown(press('KeyH', { ctrlKey: true, altKey: true }))).toEqual({
      id: 'next-heading',
    });
  });

  it('runs a press a sequence also starts with when the modifiers are let go', () => {
    const m = createShortcutMatcher(ROWS, { platform: 'pc', chrome: true });
    expect(m.keydown(press('KeyA', { ctrlKey: true, altKey: true, shiftKey: true }))).toBe(
      'pending',
    );
    expect(m.keyup(press('ShiftLeft', { ctrlKey: true, altKey: true }))).toEqual({
      id: 'comment-history',
    });
    m.keydown(press('KeyA', { ctrlKey: true, altKey: true, shiftKey: true }));
    expect(m.keydown(press('KeyL', { ctrlKey: true, altKey: true, shiftKey: true }))).toEqual({
      id: 'verbalize-cursor',
    });
  });

  it('never matches a pointer row from the keyboard', () => {
    const m = createShortcutMatcher(ROWS, { platform: 'pc', chrome: true });
    expect(m.keydown(press('KeyD'))).toBeNull();
  });

  it('answers only the rows it is asked about', () => {
    const m = createShortcutMatcher(
      ROWS.filter((r) => r.id !== 'undo'),
      { platform: 'pc', chrome: true },
    );
    expect(m.keydown(press('KeyZ', { ctrlKey: true }))).toBeNull();
  });
});

describe('officePlatformOf', () => {
  it('reads a Mac, ChromeOS, and every other machine as a PC', () => {
    expect(officePlatformOf({ platform: 'MacIntel', userAgent: '' })).toBe('mac');
    expect(officePlatformOf({ platform: 'macOS', userAgent: '' })).toBe('mac');
    expect(
      officePlatformOf({ platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 1)' }),
    ).toBe('chromeos');
    expect(officePlatformOf({ platform: 'Chrome OS', userAgent: '' })).toBe('chromeos');
    expect(officePlatformOf({ platform: 'Win32', userAgent: 'Windows' })).toBe('pc');
    expect(officePlatformOf({ platform: '', userAgent: '' })).toBe('pc');
  });
});

describe('isChromeBrowser', () => {
  it("is Chrome's own, not another Chromium browser", () => {
    expect(isChromeBrowser('Mozilla/5.0 AppleWebKit/537.36 Chrome/131.0 Safari/537.36')).toBe(true);
    expect(isChromeBrowser('Mozilla/5.0 Chrome/131.0 Safari/537.36 Edg/131.0')).toBe(false);
    expect(isChromeBrowser('Mozilla/5.0 Chrome/131.0 Safari/537.36 OPR/115.0')).toBe(false);
    expect(isChromeBrowser('Mozilla/5.0 Gecko/20100101 Firefox/133.0')).toBe(false);
  });
});
