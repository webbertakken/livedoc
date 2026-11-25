// The fonts a Text or a Callout may be set in (docs/specs/035-pdf-documents/marks.md "Changing a mark": the selected
// Texts' and Callouts' font; "Words in every script": a mark in a chosen font): the served families of the document
// fonts' menu (docs/specs/004-interface-design/fonts.md "Document fonts"), each from its Fontsource package, its
// Latin and Latin Extended subsets, regular only. None chosen is Helvetica, the first look. Pure.
import { DOCUMENT_FONTS } from '@livedoc/document';
import type { MarkFaceFamily } from './mark-face-families';

export const MARK_FONT_FAMILIES: readonly MarkFaceFamily[] = DOCUMENT_FONTS.flatMap((font) =>
  font.menu && font.served
    ? [
        {
          family: font.name,
          package: font.served.id,
          subsets: ['latin', 'latin-ext'],
          weights: [400] as const,
        },
      ]
    : [],
).sort((a, b) => a.family.localeCompare(b.family));

/** The families' names, as the catalogue spells them, in alphabetical order. */
export const MARK_FONTS: readonly string[] = MARK_FONT_FAMILIES.map((each) => each.family);

const byName = new Map(MARK_FONTS.map((name) => [name.toLowerCase(), name]));

export const MarkFonts = {
  /** The catalogue's spelling of a family named in any case; null for anything the menu does not hold. */
  of: (name: unknown): string | null =>
    typeof name === 'string' ? (byName.get(name.trim().toLowerCase()) ?? null) : null,
} as const;
