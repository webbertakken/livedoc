// The engine in a browser (docs/specs/035-pdf-documents/security.md "The boundary"): started inside a worker thread,
// the reader's binary fetched as a hashed asset of the app that bundles this entry, from LiveDoc's own origin. The
// worker asks the network for nothing else, ever.
import type { PdfEngine } from '../engine-contract';
import { createPdfEngine } from './index';

/** Starts the engine where it runs: fetches the reader's binary, then starts the reader from it. */
export async function startPdfEngine(): Promise<PdfEngine> {
  const answer = await fetch(new URL('@embedpdf/pdfium/pdfium.wasm', import.meta.url));
  if (!answer.ok) throw new Error(`the reader's binary did not load: ${answer.status}`);
  return createPdfEngine({ wasm: await answer.arrayBuffer() });
}
