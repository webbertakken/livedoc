// The mark faces a PDF's marks are set in (docs/specs/035-pdf-documents/marks.md "Words in every script"): Noto's
// families, each a few of its subsets as WOFF from its Fontsource package, drawn by the editor and embedded by its PDF
// engine, with the licence text the package carries (pinned to the published package). One row per package, as
// packages/pdf-documents/src/mark-face-families.ts lists them.
import type { TextSource } from './texts.ts';

export type MarkFaceWork = {
  /** Its Fontsource package, `@fontsource/<id>`. */
  id: string;
  name: string;
  version: string;
  /** The subsets the editor serves of it, as its files name them. */
  subsets: readonly string[];
  /** Its weights the editor serves. */
  weights: readonly (400 | 700)[];
  file: string;
  sha256: string;
};

export const MARK_FACE_WORKS: readonly MarkFaceWork[] = [
  {
    id: 'noto-sans',
    name: 'Noto Sans',
    version: '5.3.0',
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
    file: 'fontsource-noto-sans-5.3.0-LICENSE.txt',
    sha256: '54ec7b5a35310ad66f9f3091426f7028484cbf9ae1ab5da30122ee412a3009e1',
  },
  {
    id: 'noto-sans-hebrew',
    name: 'Noto Sans Hebrew',
    version: '5.3.0',
    subsets: ['hebrew'],
    weights: [400],
    file: 'fontsource-noto-sans-hebrew-5.3.0-LICENSE.txt',
    sha256: '7387750a626d005e86adc8b9321567f001fc2f6ef5c8f275261c454fe86981d4',
  },
  {
    id: 'noto-sans-arabic',
    name: 'Noto Sans Arabic',
    version: '5.3.0',
    subsets: ['arabic'],
    weights: [400],
    file: 'fontsource-noto-sans-arabic-5.3.0-LICENSE.txt',
    sha256: '91053c23e8a0fe5fc9b5fdbe5ff74ceffd66f6f996c123f1a6ca4c23487c1fff',
  },
  {
    id: 'noto-sans-armenian',
    name: 'Noto Sans Armenian',
    version: '5.3.0',
    subsets: ['armenian'],
    weights: [400],
    file: 'fontsource-noto-sans-armenian-5.3.0-LICENSE.txt',
    sha256: '8c7ec17f853c07fc50356b1f6a1e3e70813e2c59094a171da0d7b46a6e628ddd',
  },
  {
    id: 'noto-sans-georgian',
    name: 'Noto Sans Georgian',
    version: '5.3.0',
    subsets: ['georgian'],
    weights: [400],
    file: 'fontsource-noto-sans-georgian-5.3.0-LICENSE.txt',
    sha256: 'ce5a578b196eda1214696ddd63fb65ec30c58d9ff1f5c2affaed550d2254a1ca',
  },
  {
    id: 'noto-sans-thai',
    name: 'Noto Sans Thai',
    version: '5.3.0',
    subsets: ['thai'],
    weights: [400],
    file: 'fontsource-noto-sans-thai-5.3.0-LICENSE.txt',
    sha256: 'bd85ada3eef71267263e0fd24a40ae20380015c7cf1afa0c27a4340b03431320',
  },
  {
    id: 'noto-sans-lao',
    name: 'Noto Sans Lao',
    version: '5.3.0',
    subsets: ['lao'],
    weights: [400],
    file: 'fontsource-noto-sans-lao-5.3.0-LICENSE.txt',
    sha256: '7c9678e9b14919fdc1defe98d9360f9d2f6b559ff31668bd4c3bce47305a287e',
  },
  {
    id: 'noto-sans-khmer',
    name: 'Noto Sans Khmer',
    version: '5.3.0',
    subsets: ['khmer'],
    weights: [400],
    file: 'fontsource-noto-sans-khmer-5.3.0-LICENSE.txt',
    sha256: 'cebe68e383ee6acd931f8b173ee33bdcb6d3895ad0deae5272446b0ff95a96dd',
  },
  {
    id: 'noto-sans-myanmar',
    name: 'Noto Sans Myanmar',
    version: '5.3.0',
    subsets: ['myanmar'],
    weights: [400],
    file: 'fontsource-noto-sans-myanmar-5.3.0-LICENSE.txt',
    sha256: '2d7975c18ae25af40957362606d19048d6cd06fa6776aaa86188666e147f630d',
  },
  {
    id: 'noto-sans-ethiopic',
    name: 'Noto Sans Ethiopic',
    version: '5.3.0',
    subsets: ['ethiopic'],
    weights: [400],
    file: 'fontsource-noto-sans-ethiopic-5.3.0-LICENSE.txt',
    sha256: '3ffc81d38a5445271ce8e18ecc31fb1610e9fb8ee21b6fd1f09eb1b1ccc48651',
  },
  {
    id: 'noto-sans-sinhala',
    name: 'Noto Sans Sinhala',
    version: '5.3.0',
    subsets: ['sinhala'],
    weights: [400],
    file: 'fontsource-noto-sans-sinhala-5.3.0-LICENSE.txt',
    sha256: 'a29ed2ae23a746779f6083f93e04c60cfda2dafb94c7ac1e62fb8847e1576b18',
  },
  {
    id: 'noto-sans-bengali',
    name: 'Noto Sans Bengali',
    version: '5.3.0',
    subsets: ['bengali'],
    weights: [400],
    file: 'fontsource-noto-sans-bengali-5.3.0-LICENSE.txt',
    sha256: 'c0d17a4a6f928d78749dbebfa9d2953b6086c2a1f64cdd1e450cc77fb8199b32',
  },
  {
    id: 'noto-sans-gujarati',
    name: 'Noto Sans Gujarati',
    version: '5.3.0',
    subsets: ['gujarati'],
    weights: [400],
    file: 'fontsource-noto-sans-gujarati-5.3.0-LICENSE.txt',
    sha256: 'b31f1c1cece80ac67ece3e29678436faead9924b08674cd17e4447b2d64e2a00',
  },
  {
    id: 'noto-sans-gurmukhi',
    name: 'Noto Sans Gurmukhi',
    version: '5.3.0',
    subsets: ['gurmukhi'],
    weights: [400],
    file: 'fontsource-noto-sans-gurmukhi-5.3.0-LICENSE.txt',
    sha256: 'f8712907be9e05ad0461ea8af2417851ffc0da41c40ec623052883ea84c4a2c9',
  },
  {
    id: 'noto-sans-kannada',
    name: 'Noto Sans Kannada',
    version: '5.3.0',
    subsets: ['kannada'],
    weights: [400],
    file: 'fontsource-noto-sans-kannada-5.3.0-LICENSE.txt',
    sha256: '9c599f3447330d7339871ffeb177d9f4c87a5bf4ead932b8705ae055990adf96',
  },
  {
    id: 'noto-sans-malayalam',
    name: 'Noto Sans Malayalam',
    version: '5.3.0',
    subsets: ['malayalam'],
    weights: [400],
    file: 'fontsource-noto-sans-malayalam-5.3.0-LICENSE.txt',
    sha256: '29b7a0d250007948e23d1d2c734fdcf0bf6c3e278c98d6ad2c7c6bb9fedbd11c',
  },
  {
    id: 'noto-sans-oriya',
    name: 'Noto Sans Oriya',
    version: '5.3.0',
    subsets: ['oriya'],
    weights: [400],
    file: 'fontsource-noto-sans-oriya-5.3.0-LICENSE.txt',
    sha256: '939d6db1ffc18f9c6bfd51e7dd660772cd1244a2e96a183b8f1eec72cedb05a8',
  },
  {
    id: 'noto-sans-tamil',
    name: 'Noto Sans Tamil',
    version: '5.3.0',
    subsets: ['tamil'],
    weights: [400],
    file: 'fontsource-noto-sans-tamil-5.3.0-LICENSE.txt',
    sha256: '8127ad10afbdf273676361de0b3a486e1c30ac5711458309b2cbb51a4a7ea8cb',
  },
  {
    id: 'noto-sans-telugu',
    name: 'Noto Sans Telugu',
    version: '5.3.0',
    subsets: ['telugu'],
    weights: [400],
    file: 'fontsource-noto-sans-telugu-5.3.0-LICENSE.txt',
    sha256: 'eacb6e3b470b5894f81fa7091663983068a391ad1741f868e70b131051ad48ea',
  },
  {
    id: 'noto-sans-symbols',
    name: 'Noto Sans Symbols',
    version: '5.3.0',
    subsets: ['symbols'],
    weights: [400],
    file: 'fontsource-noto-sans-symbols-5.3.0-LICENSE.txt',
    sha256: '83c38c8ecdf62ac46a0e2f940df20d8ac5984fdb55a88451bff94f78c3767e23',
  },
  {
    id: 'noto-sans-symbols-2',
    name: 'Noto Sans Symbols 2',
    version: '5.3.0',
    subsets: ['symbols', 'math'],
    weights: [400],
    file: 'fontsource-noto-sans-symbols-2-5.3.0-LICENSE.txt',
    sha256: '83c38c8ecdf62ac46a0e2f940df20d8ac5984fdb55a88451bff94f78c3767e23',
  },
  {
    id: 'noto-emoji',
    name: 'Noto Emoji',
    version: '5.3.2',
    subsets: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    weights: [400],
    file: 'fontsource-noto-emoji-5.3.2-LICENSE.txt',
    sha256: '6498c6116beda77c35a13f6d08547659c39a0602e01b4ff338bb97b0c956a2bd',
  },
];

/** Where each text came from: the published package, pinned to its version. */
export const MARK_FACE_TEXT_SOURCES: readonly TextSource[] = MARK_FACE_WORKS.map((work) => ({
  file: work.file,
  sources: [`https://cdn.jsdelivr.net/npm/@fontsource/${work.id}@${work.version}/LICENSE`],
  sha256: work.sha256,
}));
