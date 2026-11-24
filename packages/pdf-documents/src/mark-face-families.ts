// The mark faces' families (docs/specs/035-pdf-documents/marks.md "Words in every script"): Noto's, as Fontsource
// serves them, each split into subsets by script, looked through in this order. Pure data: the generated table
// (mark-face-data.ts), the engine's face files and the surface's stylesheet are all made from it.

export type MarkFaceFamily = {
  /** The family's name, as the surface knows it behind `LiveDoc `. */
  readonly family: string;
  /** Its Fontsource package, `@fontsource/<package>`. */
  readonly package: string;
  /** Its subsets, in the order a character is looked for; Fontsource's numbered slices by their number. */
  readonly subsets: readonly string[];
  /** Its weights: regular, and bold where a stamp's name is set in it. */
  readonly weights: readonly (400 | 700)[];
};

/** A further script's family: its one subset, the script's own, regular only (a bold line in it is set regular). */
const script = (name: string, subset: string): MarkFaceFamily => ({
  family: `Noto Sans ${name}`,
  package: `noto-sans-${subset}`,
  subsets: [subset],
  weights: [400],
});

export const MARK_FACE_FAMILIES: readonly MarkFaceFamily[] = [
  {
    family: 'Noto Sans',
    package: 'noto-sans',
    subsets: [
      'latin',
      'latin-ext',
      'vietnamese',
      'greek',
      'greek-ext',
      'cyrillic',
      'cyrillic-ext',
      'devanagari',
    ],
    weights: [400, 700],
  },
  script('Hebrew', 'hebrew'),
  script('Arabic', 'arabic'),
  script('Armenian', 'armenian'),
  script('Georgian', 'georgian'),
  script('Thai', 'thai'),
  script('Lao', 'lao'),
  script('Khmer', 'khmer'),
  script('Myanmar', 'myanmar'),
  script('Ethiopic', 'ethiopic'),
  script('Sinhala', 'sinhala'),
  script('Bengali', 'bengali'),
  script('Gujarati', 'gujarati'),
  script('Gurmukhi', 'gurmukhi'),
  script('Kannada', 'kannada'),
  script('Malayalam', 'malayalam'),
  script('Oriya', 'oriya'),
  script('Tamil', 'tamil'),
  script('Telugu', 'telugu'),
  {
    family: 'Noto Sans Symbols',
    package: 'noto-sans-symbols',
    subsets: ['symbols'],
    weights: [400],
  },
  {
    family: 'Noto Sans Symbols 2',
    package: 'noto-sans-symbols-2',
    subsets: ['symbols', 'math'],
    weights: [400],
  },
  {
    family: 'Noto Emoji',
    package: 'noto-emoji',
    subsets: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    weights: [400],
  },
];

/** A face's id: its package, subset and weight, as `noto-sans-greek-400`. */
export const markFaceId = (pkg: string, subset: string, weight: number): string =>
  `${pkg}-${subset}-${weight}`;

/** A face's file, within the Fontsource packages: the WOFF 1.0 both the engine and the surface load. */
export const markFaceFile = (pkg: string, subset: string, weight: number): string =>
  `${pkg}/files/${pkg}-${subset}-${weight}-normal.woff`;

/** A subset's unicode range within Fontsource's `unicode.json`, which keys a numbered slice as `[n]`. */
export const markFaceRange = (ranges: Readonly<Record<string, string>>, subset: string): string => {
  const range = ranges[subset] ?? ranges[`[${subset}]`];
  if (range === undefined) throw new Error(`no unicode range for the subset ${subset}`);
  return range;
};

/** A region of Chinese, Japanese and Korean: Simplified Chinese, Japanese or Korean. */
export type MarkFaceRegion = 'sc' | 'jp' | 'kr';

/** A region's family: Fontsource's numbered slices of it, regular only, one face a region in the table. */
export type MarkFaceRegionFamily = {
  readonly region: MarkFaceRegion;
  readonly family: string;
  readonly package: string;
};

/** Chinese, Japanese and Korean, a mark's one region looked through just before this family. */
export const MARK_FACE_REGIONS_BEFORE = 'Noto Sans Symbols';

export const MARK_FACE_REGIONS: readonly MarkFaceRegionFamily[] = [
  { region: 'sc', family: 'Noto Sans SC', package: 'noto-sans-sc' },
  { region: 'jp', family: 'Noto Sans JP', package: 'noto-sans-jp' },
  { region: 'kr', family: 'Noto Sans KR', package: 'noto-sans-kr' },
];

/** A slice of a region's family: its face id, its file, its unicode range, and its file as an asset. */
export type MarkFaceSlice = {
  readonly id: string;
  readonly file: string;
  readonly range: string;
  readonly url: () => URL;
};
