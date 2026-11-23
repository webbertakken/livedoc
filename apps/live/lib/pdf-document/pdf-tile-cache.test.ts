// docs/specs/035-pdf-documents/reading-surface.md "The pages": tiles are kept to a budget, the least lately shown let
// go first; a tile scrolled back to is shown from there.
import { describe, expect, it } from 'vitest';
import type { PageBitmap } from '@livedoc/pdf-documents';
import { pdfTileCache } from './pdf-tile-cache';

// A tile of `bytes` bytes (four a pixel).
const tile = (bytes: number): PageBitmap => ({
  width: bytes / 4,
  height: 1,
  rgba: new Uint8ClampedArray(bytes),
  toView: [1, 0, 0, 1, 0, 0],
});

describe('the tile cache', () => {
  it('keeps tiles and gives them back', () => {
    const cache = pdfTileCache(100);
    const a = tile(40);
    cache.put('a', a);
    expect(cache.get('a')).toBe(a);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.bytes()).toBe(40);
  });

  it('lets the least lately shown go first, past the budget', () => {
    const cache = pdfTileCache(100);
    cache.put('a', tile(40));
    cache.put('b', tile(40));
    // Shown again: now the most lately shown.
    cache.get('a');
    cache.put('c', tile(40));
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
    expect(cache.bytes()).toBe(80);
  });

  it('counts a tile put again once', () => {
    const cache = pdfTileCache(100);
    cache.put('a', tile(40));
    cache.put('a', tile(60));
    expect(cache.bytes()).toBe(60);
  });

  it('never keeps a tile larger than the whole budget', () => {
    const cache = pdfTileCache(100);
    cache.put('a', tile(40));
    cache.put('huge', tile(200));
    expect(cache.get('huge')).toBeUndefined();
    expect(cache.bytes()).toBe(40);
  });
});
