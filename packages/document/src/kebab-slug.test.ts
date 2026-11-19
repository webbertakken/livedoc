import { describe, expect, it } from 'vitest';
import { kebabSlug } from './kebab-slug';

describe('kebabSlug', () => {
  it.each([
    ['Thomas McClean', 'thomas-mcclean'],
    ['  Café — Menu!  ', 'cafe-menu'],
    ['---', ''],
    ['', ''],
    ['a--b', 'a-b'],
  ])('slugs %j as %j', (text, slug) => {
    expect(kebabSlug(text)).toBe(slug);
  });

  it('stays fast on a long run of dashes', () => {
    const started = performance.now();
    expect(kebabSlug(`${'-'.repeat(200_000)}x${'-'.repeat(200_000)}`)).toBe('x');
    expect(performance.now() - started).toBeLessThan(200);
  });
});
