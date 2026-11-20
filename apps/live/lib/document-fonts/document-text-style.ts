// How the writing draws a text document's defaults (docs/specs/004-interface-design/fonts.md "Substitution"): its
// default family through the catalogue's stack, and its default size, as the body's own style.
import { DocumentFonts, DOCUMENT_DEFAULT_FONT } from '@livedoc/document';
import type { TextProps } from '@livedoc/text-documents';

/** Google Docs' default size, in points, for a document whose defaults name none. */
export const DOCUMENT_DEFAULT_SIZE = 11;

export function documentTextStyle(defaults: TextProps): string {
  const size =
    typeof defaults.size === 'number' && defaults.size > 0 && defaults.size < 1000
      ? defaults.size
      : DOCUMENT_DEFAULT_SIZE;
  return `font-family: ${DocumentFonts.stack(defaults.font ?? DOCUMENT_DEFAULT_FONT)}; font-size: ${size}pt`;
}
