// The mark faces on the surface (docs/specs/035-pdf-documents/marks.md "Laying out": the surface draws the mark faces
// too): each face of the generated table added to the page's fonts as `LiveDoc <family>` with its subset's range, from
// the very files the engine embeds (the same hashed assets, so one download serves both). Added once, the first time a
// mark in them is drawn; a browser then downloads a subset only when a line on screen uses its characters.
import { MARK_FACE_DATA, MARK_FACE_URLS, type MarkWords } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { TYPED_FACES } from './pdf-typed';

/** The page's names for the mark faces' families, in the order a character is looked for. */
const FAMILIES = [...new Set(MARK_FACE_DATA.map((face) => `LiveDoc ${face.family}`))];

/** The faces a line in the mark faces is drawn in: LiveDoc's own, then the browser's until they arrive. */
export const MARK_FACES_STACK = `${FAMILIES.map((family) => `"${family}"`).join(', ')}, sans-serif`;

/** The faces a mark's words are drawn in on the surface. */
export const facesStackOf = (words: Pick<MarkWords, 'faces'>): string =>
  words.faces === 'noto' ? MARK_FACES_STACK : TYPED_FACES;

const added = new WeakSet<FontFaceSet>();

/** Adds the mark faces to a page's fonts, once a page. */
export function addMarkFaces(fonts: FontFaceSet = document.fonts): void {
  if (added.has(fonts)) return;
  added.add(fonts);
  for (const face of MARK_FACE_DATA) {
    const url = MARK_FACE_URLS[face.file]!();
    fonts.add(
      new FontFace(`LiveDoc ${face.family}`, `url("${url.href}") format("woff")`, {
        weight: String(face.weight),
        unicodeRange: face.range,
        display: 'swap',
      }),
    );
  }
  debugLog(`[pdf] faces-shown count=${MARK_FACE_DATA.length}`);
}
