// The mark faces on the surface (docs/specs/035-pdf-documents/marks.md "Laying out": the surface draws the mark faces
// too): each face of the generated table added to the page's fonts as `LiveDoc <family>` with its subset's range, from
// the very files the engine embeds (the same hashed assets, so one download serves both). Added once, the first time a
// mark in them is drawn; a browser then downloads a subset only when a line on screen uses its characters. A region of
// Chinese, Japanese and Korean adds its slices the first time a mark in it is drawn, and a mark in it is drawn in its
// region's family alone.
import {
  MARK_FACE_DATA,
  MARK_FACE_REGIONS,
  MARK_FACE_REGIONS_BEFORE,
  MARK_FACE_URLS,
  MarkFaceSlices,
  type MarkFaceRegion,
  type MarkWords,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { TYPED_FACES } from './pdf-typed';

/** A region's family as the page knows it. */
const regionFamily = (region: MarkFaceRegion): string =>
  `LiveDoc ${MARK_FACE_REGIONS.find((each) => each.region === region)!.family}`;

/** The page's names for the mark faces' families, in the order a character is looked for: one region's alone. */
const familiesOf = (region: MarkFaceRegion): string[] => {
  const families = [...new Set(MARK_FACE_DATA.map((face) => face.family))].map(
    (family) => `LiveDoc ${family}`,
  );
  families.splice(families.indexOf(`LiveDoc ${MARK_FACE_REGIONS_BEFORE}`), 0, regionFamily(region));
  return families;
};

/** The faces a line in the mark faces is drawn in: LiveDoc's own, then the browser's until they arrive. */
export const markFacesStack = (region: MarkFaceRegion): string =>
  `${familiesOf(region)
    .map((family) => `"${family}"`)
    .join(', ')}, sans-serif`;

/** The faces a mark's words are drawn in on the surface. */
export const facesStackOf = (words: Pick<MarkWords, 'faces' | 'region'>): string =>
  words.faces === 'noto' ? markFacesStack(words.region) : TYPED_FACES;

const added = new WeakMap<FontFaceSet, Set<MarkFaceRegion | 'subsets'>>();

/**
 * Adds the mark faces to a page's fonts, once a page, and a region's slices, once a region; answers once they are
 * added. A region whose slices do not load is drawn in the browser's own faces, and tried again the next time.
 */
export async function addMarkFaces(
  region: MarkFaceRegion | null = null,
  fonts: FontFaceSet = document.fonts,
): Promise<void> {
  const done = added.get(fonts) ?? new Set();
  added.set(fonts, done);
  if (!done.has('subsets')) {
    done.add('subsets');
    for (const face of MARK_FACE_DATA)
      fonts.add(
        new FontFace(
          `LiveDoc ${face.family}`,
          `url("${MARK_FACE_URLS[face.file]!().href}") format("woff")`,
          {
            weight: String(face.weight),
            unicodeRange: face.range,
            display: 'swap',
          },
        ),
      );
    debugLog(`[pdf] faces-shown count=${MARK_FACE_DATA.length}`);
  }
  if (!region || done.has(region)) return;
  done.add(region);
  const slices = await MarkFaceSlices.load(region).catch(() => null);
  if (!slices) {
    done.delete(region);
    debugLog(
      `[pdf] faces-failed face=${MARK_FACE_REGIONS.find((each) => each.region === region)!.package}-400`,
    );
    return;
  }
  for (const slice of slices)
    fonts.add(
      new FontFace(regionFamily(region), `url("${slice.url().href}") format("woff")`, {
        weight: '400',
        unicodeRange: slice.range,
        display: 'swap',
      }),
    );
  debugLog(`[pdf] faces-shown count=${slices.length}`);
}
