import { describe, expect, it } from 'vitest';
import { PageName } from './page-name';

describe('PageName', () => {
  it('names a stored page by its object number', () => {
    const name = PageName.ofObject(12);
    expect(name).toBe('p:12');
    expect(PageName.objectNumber(name)).toBe(12);
  });

  it('parses stored and inserted names', () => {
    expect(PageName.parse('p:3')).toBe('p:3');
    expect(PageName.parse('n:a1B2_c-3')).toBe('n:a1B2_c-3');
  });

  it('has no object number for an inserted page', () => {
    expect(PageName.objectNumber('n:fresh')).toBeNull();
  });

  it('refuses what is not a name', () => {
    for (const value of [
      'p:0',
      'p:-1',
      'p:1.5',
      'p:',
      'n:',
      'n:has space',
      'x:1',
      3,
      null,
      undefined,
    ])
      expect(PageName.parse(value)).toBeNull();
  });
});
