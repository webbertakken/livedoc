import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markFaceRegionDataSource, markFaceSlicesSource } from './engine/mark-face-region-table';
import {
  markFaceDataSource,
  markFaceFilesOf,
  markFaceUrlsSource,
  markFontDataSource,
} from './engine/mark-face-table';
import { MARK_FACE_DATA } from './mark-face-data';
import { MARK_FACE_REGIONS, markFaceRange } from './mark-face-families';
import { MARK_FONT_DATA } from './mark-font-data';
import { markFaceFiles } from './testing/fixtures';

const source = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

// marks.md "Laying out": the table is generated from the very files LiveDoc serves; a test fails while they differ.
describe('the table of the mark faces', () => {
  it('is what the Fontsource packages make of it', async () => {
    expect(await markFaceDataSource(markFaceFiles)).toBe(source('mark-face-data.ts'));
  });

  it('is what the Fontsource packages make of the fonts a Text or a Callout may be set in', async () => {
    expect(await markFontDataSource(markFaceFiles)).toBe(source('mark-font-data.ts'));
    expect(MARK_FONT_DATA.find((face) => face.id === 'lora-latin-ext-400')?.file).toBe(
      'lora/files/lora-latin-ext-400-normal.woff',
    );
  });

  it('is what the Fontsource slices make of Chinese, Japanese and Korean', async () => {
    expect(await markFaceRegionDataSource(markFaceFiles)).toBe(source('mark-face-region-data.ts'));
    for (const { region } of MARK_FACE_REGIONS)
      expect(await markFaceSlicesSource(markFaceFiles, region)).toBe(
        source(`mark-face-slices-${region}.ts`),
      );
  });

  it('names the file of each face, the fonts after the mark faces, as an asset of the app', () => {
    expect(markFaceFilesOf()).toEqual(
      [...MARK_FACE_DATA, ...MARK_FONT_DATA].map((face) => face.file),
    );
    expect(markFaceUrlsSource(markFaceFilesOf())).toBe(source('mark-face-urls.ts'));
  });

  it('reads a subset range from the unicode.json of Fontsource, a numbered slice keyed in brackets', () => {
    const ranges = { latin: 'U+0000-00FF', '[3]': 'U+1F600' };
    expect(markFaceRange(ranges, 'latin')).toBe('U+0000-00FF');
    expect(markFaceRange(ranges, '3')).toBe('U+1F600');
    expect(() => markFaceRange(ranges, 'greek')).toThrow('no unicode range for the subset greek');
  });
});
