// The Google Fonts catalogue More fonts lists (docs/specs/004-interface-design/fonts.md "More fonts"): each family's
// name, category, Google's popularity and trending ranks, the date it was added, and the faces a document asks Google
// Fonts for. Written from Google Fonts' public metadata by `pnpm fonts:google`; read lazily, as the dialog opens or a
// document names a family LiveDoc does not serve.
import type { DocumentFontGeneric } from '@livedoc/document';

export const GOOGLE_FONTS_METADATA = 'https://fonts.google.com/metadata/fonts';

export const FONT_CATEGORIES = [
  'Display',
  'Handwriting',
  'Monospace',
  'Serif',
  'Sans Serif',
] as const;
export type FontCategory = (typeof FONT_CATEGORIES)[number];

/** One family as the generated file holds it: name, category, popularity, trending, date added, css2 axes. */
export type GoogleFontRow = readonly [string, FontCategory, number, number, string, string];
export type GoogleFontCatalogueFile = {
  readonly source: string;
  readonly families: readonly GoogleFontRow[];
};

export type GoogleFont = {
  readonly name: string;
  readonly category: FontCategory;
  readonly popularity: number;
  readonly trending: number;
  readonly dateAdded: string;
  /** The css2 axis list (`wght@400;700`, `ital,wght@0,400;1,400`); empty for the regular face alone. */
  readonly axes: string;
};

const GENERIC_CATEGORY: Record<DocumentFontGeneric, FontCategory> = {
  roman: 'Serif',
  swiss: 'Sans Serif',
  modern: 'Monospace',
  script: 'Handwriting',
  decorative: 'Display',
};

/** The category a catalogue family is listed in, from its generic family. */
export const categoryOfGeneric = (generic: DocumentFontGeneric): FontCategory =>
  GENERIC_CATEGORY[generic];

const nearest = (weights: readonly number[], target: number): number =>
  weights.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best));

const regularAndBold = (weights: readonly number[]): number[] =>
  weights.length === 0
    ? []
    : [...new Set([nearest(weights, 400), nearest(weights, 700)])].sort((a, b) => a - b);

/**
 * The faces a document asks for, from a family's face keys (`400`, `700i`): regular and bold, upright and italic, or
 * the nearest weights it has. css2 refuses a face a family lacks, so only faces it has are named.
 */
export function googleFontAxes(faces: readonly string[]): string {
  const weightsOf = (italic: boolean) =>
    faces
      .filter((key) => key.endsWith('i') === italic)
      .map((key) => Number.parseInt(key, 10))
      .sort((a, b) => a - b);
  const upright = regularAndBold(weightsOf(false));
  const italic = regularAndBold(weightsOf(true));
  if (italic.length === 0)
    return upright.length === 1 && upright[0] === 400 ? '' : `wght@${upright.join(';')}`;
  const pairs = [...upright.map((w) => `0,${w}`), ...italic.map((w) => `1,${w}`)];
  return `ital,wght@${pairs.join(';')}`;
}

const isCategory = (category: string): category is FontCategory =>
  (FONT_CATEGORIES as readonly string[]).includes(category);

// One family of Google Fonts' metadata as the catalogue keeps it, or null for one of another shape or category.
function rowOf(family: unknown): GoogleFontRow | null {
  if (typeof family !== 'object' || family === null) return null;
  const {
    family: name,
    category,
    popularity,
    trending,
    dateAdded,
    fonts,
  } = family as Record<string, unknown>;
  const valid =
    typeof name === 'string' &&
    typeof category === 'string' &&
    isCategory(category) &&
    typeof popularity === 'number' &&
    typeof trending === 'number' &&
    typeof dateAdded === 'string' &&
    typeof fonts === 'object' &&
    fonts !== null;
  return valid
    ? [name, category, popularity, trending, dateAdded, googleFontAxes(Object.keys(fonts))]
    : null;
}

/** The generated file from Google Fonts' metadata: its families in alphabetical order, the first of a repeated name. */
export function googleFontCatalogueOf(metadata: unknown): GoogleFontCatalogueFile {
  const list =
    typeof metadata === 'object' && metadata !== null
      ? (metadata as { familyMetadataList?: unknown }).familyMetadataList
      : undefined;
  if (!Array.isArray(list)) throw new Error('[fonts] google metadata has no familyMetadataList');
  const seen = new Set<string>();
  const families: GoogleFontRow[] = [];
  for (const family of list as readonly unknown[]) {
    const row = rowOf(family);
    if (!row || seen.has(row[0])) continue;
    seen.add(row[0]);
    families.push(row);
  }
  families.sort(([a], [b]) => a.localeCompare(b, 'en'));
  return { source: `${GOOGLE_FONTS_METADATA} (pnpm fonts:google)`, families };
}

/** The fonts of the generated file, as read from JSON: a row of any other shape is left out. */
export function googleFontsOf(file: {
  readonly families: readonly (readonly unknown[])[];
}): GoogleFont[] {
  return file.families.flatMap((row) => {
    const [name, category, popularity, trending, dateAdded, axes] = row;
    const valid =
      typeof name === 'string' &&
      typeof category === 'string' &&
      isCategory(category) &&
      typeof popularity === 'number' &&
      typeof trending === 'number' &&
      typeof dateAdded === 'string' &&
      typeof axes === 'string';
    return valid ? [{ name, category, popularity, trending, dateAdded, axes }] : [];
  });
}

let loading: Promise<readonly GoogleFont[]> | null = null;

/** The catalogue, imported once on first ask; a failed import is asked again next time. */
export function loadGoogleFonts(): Promise<readonly GoogleFont[]> {
  loading ??= import('./google-fonts.json').then(
    (module) => googleFontsOf(module.default),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}
