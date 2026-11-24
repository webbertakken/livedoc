import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markFaceDataSource, markFaceFilesOf, markFaceUrlsSource } from './engine/mark-face-table';
import { MARK_FACE_DATA } from './mark-face-data';
import { markFaceRange } from './mark-face-families';
import { markFaceFiles } from './testing/fixtures';

// marks.md "Laying out": the table is generated from the very files LiveDoc serves; a test fails while they differ.
describe('the table of the mark faces', () => {
  it('is what the Fontsource packages make of it', async () => {
    expect(await markFaceDataSource(markFaceFiles)).toBe(
      readFileSync(new URL('./mark-face-data.ts', import.meta.url), 'utf8'),
    );
  });

  it('names the file of each face as an asset of the app that bundles the engine', () => {
    expect(markFaceFilesOf()).toEqual(MARK_FACE_DATA.map((face) => face.file));
    expect(markFaceUrlsSource(markFaceFilesOf())).toBe(
      readFileSync(new URL('./mark-face-urls.ts', import.meta.url), 'utf8'),
    );
  });

  it('reads a subset range from the unicode.json of Fontsource, a numbered slice keyed in brackets', () => {
    const ranges = { latin: 'U+0000-00FF', '[3]': 'U+1F600' };
    expect(markFaceRange(ranges, 'latin')).toBe('U+0000-00FF');
    expect(markFaceRange(ranges, '3')).toBe('U+1F600');
    expect(() => markFaceRange(ranges, 'greek')).toThrow('no unicode range for the subset greek');
  });
});
