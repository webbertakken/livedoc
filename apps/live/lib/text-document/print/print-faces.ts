// The faces a text document's PDF sets its words in (docs/specs/034-text-documents/files-and-print.md "Downloading",
// PDF): the served document font the page drew them in (fonts.md "Served from LiveDoc"), read from its computed
// `font-family` as the first `LiveDoc <name>` the catalogue serves, at the nearest style it has; its WOFF files,
// Latin then Latin Extended, are the app's own assets. Words in no served family are set in the mark faces.
import { DocumentFonts, type DocumentFontStyle } from '@livedoc/document';
import type { LaidOutFace } from '@livedoc/pdf-documents/laid-out';
import { DOCUMENT_FONT_FILES_WOFF } from '@/lib/document-fonts/document-font-files';
import { DOCUMENT_FONT_SUBSETS, documentFontWoff } from '@/lib/document-fonts/document-font-faces';

/** Weights from this up are set bold. */
const BOLD_FROM = 600;
const SERVED_PREFIX = 'LiveDoc ';

/** The families of a CSS `font-family`, unquoted, in order. */
const familiesOf = (fontFamily: string): string[] =>
  fontFamily
    .split(',')
    .map((family) => family.trim().replace(/^["']|["']$/g, ''))
    .filter((family) => family !== '');

/** The face words drawn in `fontFamily`, at `weight` and slant, are set in. */
export function printFaceOf(fontFamily: string, weight: number, italic: boolean): LaidOutFace {
  const bold = weight >= BOLD_FROM;
  const served = familiesOf(fontFamily)
    .filter((family) => family.startsWith(SERVED_PREFIX))
    .map((family) => DocumentFonts.find(family.slice(SERVED_PREFIX.length))?.served)
    .find((each) => each !== undefined);
  if (!served) return { id: `none-${bold ? 700 : 400}`, files: [], bold };
  const wanted: DocumentFontStyle[] = [
    `${bold ? 700 : 400}-${italic ? 'italic' : 'normal'}`,
    `${bold ? 700 : 400}-normal`,
    `400-${italic ? 'italic' : 'normal'}`,
    '400-normal',
  ];
  const style = wanted.find((each) => served.styles.includes(each)) ?? served.styles[0]!;
  // Latin first: most words are in it.
  const subsets = [...DOCUMENT_FONT_SUBSETS].reverse();
  return {
    id: `${served.id}-${style}`,
    files: subsets.map((subset) => documentFontWoff(served.id, subset, style)),
    bold,
  };
}

/**
 * Answers a face's file: a served document font's as the app's own asset, any other (the mark faces) through
 * `markFace`. A file that does not load throws.
 */
export function printFaceSource(
  fetchUrl: (url: string) => Promise<Response>,
  markFace: (file: string) => Promise<Uint8Array<ArrayBuffer>>,
): (file: string) => Promise<Uint8Array<ArrayBuffer>> {
  return async (file) => {
    const url = DOCUMENT_FONT_FILES_WOFF[file];
    if (!url) return markFace(file);
    const answer = await fetchUrl(url().href);
    if (!answer.ok) throw new Error(`the face did not load: ${answer.status}`);
    return new Uint8Array(await answer.arrayBuffer());
  };
}
