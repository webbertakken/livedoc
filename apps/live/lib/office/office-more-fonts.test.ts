// docs/specs/004-interface-design/fonts.md "More fonts": the list, searched, shown by category and sorted.
import { describe, expect, it } from 'vitest';
import type { GoogleFont } from '@/lib/document-fonts/google-font-catalogue';
import {
  FONT_SHOW,
  FONT_SORT,
  moreFontsFamilies,
  moreFontsRows,
  rowFace,
} from './office-more-fonts';

const google = (
  name: string,
  category: GoogleFont['category'],
  popularity: number,
  trending: number,
  dateAdded: string,
): GoogleFont => ({ name, category, popularity, trending, dateAdded, axes: '' });

const GOOGLE: readonly GoogleFont[] = [
  google('Lora', 'Serif', 30, 5, '2011-01-01'),
  google('Rubik', 'Sans Serif', 10, 50, '2015-01-01'),
  google('Caveat', 'Handwriting', 90, 2, '2020-01-01'),
  google('Space Mono', 'Monospace', 60, 9, '2016-01-01'),
];

const names = (rows: readonly { name: string }[]) => rows.map((r) => r.name);

describe('moreFontsFamilies (the list: Google Fonts and the named menu families)', () => {
  const families = moreFontsFamilies(GOOGLE);

  it('adds the named menu families Google Fonts lacks, in the category of their generic family', () => {
    expect(families.find((f) => f.name === 'Arial')).toEqual({
      name: 'Arial',
      category: 'Sans Serif',
      google: null,
    });
    expect(families.find((f) => f.name === 'Times New Roman')?.category).toBe('Serif');
    expect(families.find((f) => f.name === 'Courier New')?.category).toBe('Monospace');
    expect(families.find((f) => f.name === 'Comic Sans MS')?.category).toBe('Handwriting');
  });

  it('lists a family both have once, with its Google ranks', () => {
    expect(families.filter((f) => f.name === 'Lora')).toEqual([
      { name: 'Lora', category: 'Serif', google: GOOGLE[0] },
    ]);
  });

  it('names the categories and sorts', () => {
    expect(FONT_SHOW).toEqual([
      'All fonts',
      'Display',
      'Handwriting',
      'Monospace',
      'Serif',
      'Sans Serif',
    ]);
    expect(FONT_SORT).toEqual(['Popularity', 'Alphabetical', 'Date added', 'Trending']);
  });
});

describe('moreFontsRows', () => {
  const families = moreFontsFamilies(GOOGLE);
  const rows = (
    query: string,
    show: (typeof FONT_SHOW)[number],
    sort: (typeof FONT_SORT)[number],
  ) => names(moreFontsRows(families, { query, show, sort }));

  it('keeps the families whose name holds every word typed, ignoring case', () => {
    expect(rows('MONO', 'All fonts', 'Alphabetical')).toEqual(['Space Mono']);
    expect(rows(' mono  space ', 'All fonts', 'Alphabetical')).toEqual(['Space Mono']);
    expect(rows('nothing like it', 'All fonts', 'Alphabetical')).toEqual([]);
  });

  it('shows one category', () => {
    expect(rows('', 'Serif', 'Alphabetical')).toEqual(['Georgia', 'Lora', 'Times New Roman']);
  });

  it('sorts by popularity, the named families first', () => {
    expect(rows('', 'Serif', 'Popularity')).toEqual(['Georgia', 'Times New Roman', 'Lora']);
    expect(rows('', 'All fonts', 'Popularity').slice(-4)).toEqual([
      'Rubik',
      'Lora',
      'Space Mono',
      'Caveat',
    ]);
  });

  it('sorts by date added, newest first, and by trending, the named families last', () => {
    expect(rows('', 'All fonts', 'Date added').slice(0, 4)).toEqual([
      'Caveat',
      'Space Mono',
      'Rubik',
      'Lora',
    ]);
    expect(rows('', 'Serif', 'Date added')).toEqual(['Lora', 'Georgia', 'Times New Roman']);
    expect(rows('', 'All fonts', 'Trending').slice(0, 4)).toEqual([
      'Caveat',
      'Lora',
      'Space Mono',
      'Rubik',
    ]);
  });
});

describe('rowFace (each row in its face)', () => {
  it('draws a catalogue family in its stack, never fetched', () => {
    expect(rowFace('Lora')).toBe('"LiveDoc Lora", serif');
  });

  it('draws a Google family in its preview, then its full faces, then the dialog face', () => {
    expect(rowFace('Rubik')).toBe('"LiveDoc preview Rubik", "Rubik", system-ui, sans-serif');
  });
});
