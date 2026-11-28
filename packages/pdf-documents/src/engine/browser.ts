// The engine in a browser (docs/specs/035-pdf-documents/security.md "The boundary"): started inside a worker thread,
// the reader's binary fetched as a hashed asset of the app that bundles this entry, from LiveDoc's own origin. The
// worker asks the network for nothing else but the mark faces and their shaper, LiveDoc's own assets too, and only
// when a bake's marks need them (marks.md "Loading").
import type { PdfEngine, PdfEngineLog } from '../engine-contract';
import { createPdfEngine } from './index';
import { fetchMarkFace } from './fetch-mark-face';

export { fetchMarkFace } from './fetch-mark-face';

/** The reader's binary did not load: a failure with a name of its own, since only a failure's name is logged. */
export class ReaderNotLoaded extends Error {
  override readonly name = 'ReaderNotLoaded';
}

/**
 * Starts the engine where it runs: fetches the reader's binary, then starts the reader from it. `log` takes what
 * the engine decides.
 */
export async function startPdfEngine(log?: PdfEngineLog): Promise<PdfEngine> {
  const answer = await fetch(new URL('@embedpdf/pdfium/pdfium.wasm', import.meta.url));
  if (!answer.ok) throw new ReaderNotLoaded(`the reader's binary did not load: ${answer.status}`);
  return createPdfEngine({ wasm: await answer.arrayBuffer(), log, faces: fetchMarkFace });
}
