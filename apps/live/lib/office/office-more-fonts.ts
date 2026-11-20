// The Fonts dialog's list (docs/specs/004-interface-design/fonts.md "More fonts"): Google Fonts' families and the
// catalogue's named menu families, searched by the words typed, shown by category and sorted by Google's ranks. The
// named families have no ranks: they lead Popularity and close the other sorts.
import { DOCUMENT_FONTS, DocumentFonts } from '@livedoc/document';
import {
  categoryOfGeneric,
  type FontCategory,
  type GoogleFont,
} from '@/lib/document-fonts/google-font-catalogue';
import { previewFamily } from '@/lib/document-fonts/google-font-loading';

export const FONT_SHOW = [
  'All fonts',
  'Display',
  'Handwriting',
  'Monospace',
  'Serif',
  'Sans Serif',
] as const;
export type FontShow = (typeof FONT_SHOW)[number];

export const FONT_SORT = ['Popularity', 'Alphabetical', 'Date added', 'Trending'] as const;
export type FontSort = (typeof FONT_SORT)[number];

/** One family of the list; `google` is null for a named family Google Fonts does not have. */
export type MoreFontsFamily = {
  readonly name: string;
  readonly category: FontCategory;
  readonly google: GoogleFont | null;
};

export function moreFontsFamilies(google: readonly GoogleFont[]): MoreFontsFamily[] {
  const known = new Set(google.map((f) => f.name.toLowerCase()));
  const named = DOCUMENT_FONTS.filter(
    (f) => f.menu && !f.served && !known.has(f.name.toLowerCase()),
  ).map((f) => ({ name: f.name, category: categoryOfGeneric(f.generic), google: null }));
  return [...google.map((f) => ({ name: f.name, category: f.category, google: f })), ...named];
}

const alphabetical = (a: MoreFontsFamily, b: MoreFontsFamily) => a.name.localeCompare(b.name, 'en');

// Named families first or last, then by the rank; ties in alphabetical order.
const byRank =
  (rank: (f: GoogleFont) => number, namedFirst: boolean) =>
  (a: MoreFontsFamily, b: MoreFontsFamily): number => {
    if (a.google && b.google) return rank(a.google) - rank(b.google) || alphabetical(a, b);
    if (!a.google && !b.google) return alphabetical(a, b);
    return (a.google ? 1 : -1) * (namedFirst ? 1 : -1);
  };

const SORTS: Record<FontSort, (a: MoreFontsFamily, b: MoreFontsFamily) => number> = {
  Popularity: byRank((f) => f.popularity, true),
  Alphabetical: alphabetical,
  // Newest first: a later ISO date ranks earlier.
  'Date added': byRank((f) => -Date.parse(f.dateAdded), false),
  Trending: byRank((f) => f.trending, false),
};

export function moreFontsRows(
  families: readonly MoreFontsFamily[],
  { query, show, sort }: { query: string; show: FontShow; sort: FontSort },
): MoreFontsFamily[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return families
    .filter((f) => show === 'All fonts' || f.category === show)
    .filter((f) => words.every((word) => f.name.toLowerCase().includes(word)))
    .sort(SORTS[sort]);
}

/**
 * The face a row draws its name in: a catalogue family's stack (LiveDoc's own faces, never fetched); a Google family's
 * preview of its name, then its full faces where they loaded, then the dialog's own face.
 */
export function rowFace(name: string): string {
  if (DocumentFonts.find(name)) return DocumentFonts.stack(name);
  return `"${previewFamily(name)}", "${name}", system-ui, sans-serif`;
}
