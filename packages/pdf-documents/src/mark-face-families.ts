// The mark faces' families (docs/specs/035-pdf-documents/marks.md "Words in every script"): Noto's, as Fontsource
// serves them, each split into subsets by script, looked through in this order. Pure data: the generated table
// (mark-face-data.ts), the engine's face files and the surface's stylesheet are all made from it.

export type MarkFaceFamily = {
  /** The family's name, as the surface knows it behind `LiveDoc `. */
  readonly family: string;
  /** Its Fontsource package, `@fontsource/<package>`. */
  readonly package: string;
  /** Its subsets, in the order a character is looked for. */
  readonly subsets: readonly string[];
  /** Its weights: regular, and bold where a stamp's name is set in it. */
  readonly weights: readonly (400 | 700)[];
};

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
];

/** A face's id: its package, subset and weight, as `noto-sans-greek-400`. */
export const markFaceId = (pkg: string, subset: string, weight: number): string =>
  `${pkg}-${subset}-${weight}`;

/** A face's file, within the Fontsource packages: the WOFF 1.0 both the engine and the surface load. */
export const markFaceFile = (pkg: string, subset: string, weight: number): string =>
  `${pkg}/files/${pkg}-${subset}-${weight}-normal.woff`;
