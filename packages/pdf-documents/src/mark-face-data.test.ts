import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markFaceDataSource, markFaceUrlsSource } from './engine/mark-face-table';
import { MARK_FACE_DATA } from './mark-face-data';
import { markFaceFiles } from './testing/fixtures';

// marks.md "Laying out": the table is generated from the very files LiveDoc serves; a test fails while they differ.
describe('the table of the mark faces', () => {
  it('is what the Fontsource packages make of it', async () => {
    expect(await markFaceDataSource(markFaceFiles)).toBe(
      readFileSync(new URL('./mark-face-data.ts', import.meta.url), 'utf8'),
    );
  });

  it('names the file of each face as an asset of the app that bundles the engine', () => {
    expect(markFaceUrlsSource(MARK_FACE_DATA.map((face) => face.file))).toBe(
      readFileSync(new URL('./mark-face-urls.ts', import.meta.url), 'utf8'),
    );
  });
});
