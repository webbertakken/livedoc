// A picture's kind by its first bytes (docs/specs/029-sheets/imports.md "IMAGE", D73): the seven kinds IMAGE shows,
// and nothing for an SVG, a page or too few bytes.
import { describe, expect, it } from 'vitest';
import { sniffImage } from './sniff-image';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((ch) => ch.charCodeAt(0)) : p)),
  );
const pad = new Array<number>(16).fill(0);

describe('sniffImage', () => {
  it.each([
    ['image/png', bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], pad)],
    ['image/jpeg', bytes([0xff, 0xd8, 0xff, 0xe0], pad)],
    ['image/gif', bytes('GIF87a', pad)],
    ['image/gif', bytes('GIF89a', pad)],
    ['image/webp', bytes('RIFF', [0, 0, 0, 0], 'WEBP', pad)],
    ['image/avif', bytes([0, 0, 0, 0x1c], 'ftypavif', pad)],
    ['image/avif', bytes([0, 0, 0, 0x1c], 'ftypavis', pad)],
    ['image/bmp', bytes('BM', pad)],
    ['image/x-icon', bytes([0, 0, 1, 0], pad)],
  ])('knows %s', (type, b) => {
    expect(sniffImage(b)).toBe(type);
  });

  it.each([
    ['an SVG', bytes('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['a page', bytes('<!doctype html><p>hi</p>')],
    ['a RIFF that is no WebP', bytes('RIFF', [0, 0, 0, 0], 'WAVE', pad)],
    ['an ftyp that is no AVIF', bytes([0, 0, 0, 0x1c], 'ftypisom', pad)],
    ['a bare BM', bytes('BM')],
    ['a bare icon header', bytes([0, 0, 1, 0])],
    ['nothing', bytes()],
  ])('refuses %s', (_, b) => {
    expect(sniffImage(b)).toBeNull();
  });
});
