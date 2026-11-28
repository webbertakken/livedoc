// The mark faces' files fetched in a browser (docs/specs/035-pdf-documents/marks.md "Loading"): LiveDoc's own hashed
// assets, from its own origin. Apart from the engine, so a writer on the page (laid-out-pages.ts) fetches them without
// the reader.
import { MARK_FACE_URLS } from '../mark-face-urls';
import { MarkFaceSlices } from '../mark-face-slices';
import type { MarkFaceSource } from './typesetter';

/**
 * A mark face's file, a subset's or a region's slice, fetched as the app's own asset; a face the app does not bundle,
 * or a failed fetch, throws.
 */
export const fetchMarkFace: MarkFaceSource = async (file) => {
  const url = MARK_FACE_URLS[file] ?? (await MarkFaceSlices.sliceOf(file))?.url;
  if (!url) throw new Error('the app bundles no such face');
  const answer = await fetch(url());
  if (!answer.ok) throw new Error(`the face did not load: ${answer.status}`);
  return new Uint8Array(await answer.arrayBuffer());
};
