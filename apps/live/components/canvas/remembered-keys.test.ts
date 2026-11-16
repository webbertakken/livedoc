// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRememberedKeys } from './remembered-keys';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('remembered keys', () => {
  it('adds and removes keys, tells its readers, and survives a reload', () => {
    const keys = createRememberedKeys('test:keys', 3);
    let told = 0;
    const off = keys.subscribe(() => told++);
    keys.add('a');
    expect(keys.has('a')).toBe(true);
    expect(createRememberedKeys('test:keys', 3).has('a')).toBe(true);
    keys.remove('a');
    expect(keys.has('a')).toBe(false);
    expect(told).toBe(2);
    off();
  });

  it('keeps the newest keys within its bound, once each', () => {
    const keys = createRememberedKeys('test:keys', 2);
    keys.add('a');
    keys.add('b');
    keys.add('a');
    keys.add('c');
    expect(keys.has('b')).toBe(false);
    expect(JSON.parse(localStorage.getItem('test:keys')!)).toEqual(['a', 'c']);
  });

  it('keeps a key for this session when storage refuses it, and reads junk as nothing', () => {
    const keys = createRememberedKeys('test:keys', 2);
    localStorage.setItem('test:keys', '{oops');
    expect(keys.has('x')).toBe(false);
    localStorage.setItem('test:keys', '{"x":1}');
    expect(keys.has('x')).toBe(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    keys.add('x');
    expect(keys.has('x')).toBe(true);
    keys.remove('x');
    expect(keys.has('x')).toBe(false);
  });
});
