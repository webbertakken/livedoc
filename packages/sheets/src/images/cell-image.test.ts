// IMAGE's arguments (docs/specs/029-sheets/imports.md "IMAGE"): Google's four modes, the sizes read only in mode 4,
// the address read as an import's (D61), and the host a picture is named by.
import { describe, expect, it } from 'vitest';
import { IMPORT_WORDS } from '../imports/import-request';
import { imageHost, readImageArgs, type CellImage } from './cell-image';

const URL_ = 'https://example.com/a.png';
const image = (over: Partial<CellImage> = {}): CellImage => ({
  url: URL_,
  mode: 1,
  height: null,
  width: null,
  ...over,
});

describe('IMAGE arguments', () => {
  it('reads the address, mode 1 by default, the sizes only in mode 4', () => {
    expect(readImageArgs([URL_])).toEqual(image());
    expect(readImageArgs([URL_, null])).toEqual(image());
    expect(readImageArgs([URL_, 3, 10, 20])).toEqual(image({ mode: 3 }));
    expect(readImageArgs([URL_, 4, 10, 20])).toEqual(image({ mode: 4, height: 10, width: 20 }));
    expect(readImageArgs([URL_, 4, null, '20'])).toEqual(image({ mode: 4, width: 20 }));
    expect(readImageArgs(['example.com/a.png', '2'])).toEqual(
      image({ url: 'http://example.com/a.png', mode: 2 }),
    );
  });

  it('refuses a mode other than 1 to 4 and a size not above 0 (#VALUE!)', () => {
    for (const args of [
      [URL_, 5],
      [URL_, 0],
      [URL_, 1.5],
      [URL_, 4, 0],
      [URL_, 4, 10, -1],
    ])
      expect(readImageArgs(args)).toMatchObject({ e: '#VALUE!' });
    expect(readImageArgs([URL_, 'x'])).toMatchObject({ e: '#VALUE!' });
    expect(readImageArgs([URL_, 4, 'x'])).toMatchObject({ e: '#VALUE!' });
    expect(readImageArgs([URL_, 4, 1, 'x'])).toMatchObject({ e: '#VALUE!' });
  });

  it('passes an error on and reads a bad address as an import does (#N/A)', () => {
    expect(readImageArgs([{ e: '#DIV/0!' }])).toEqual({ e: '#DIV/0!' });
    expect(readImageArgs(['ftp://x/a.png'])).toEqual({
      e: '#N/A',
      why: IMPORT_WORDS.urlNotFound('ftp://x/a.png'),
    });
    expect(readImageArgs([undefined])).toMatchObject({ e: '#N/A' });
  });
});

describe('imageHost', () => {
  it('names the host a picture comes from', () => {
    expect(imageHost(image())).toBe('example.com');
  });
});
