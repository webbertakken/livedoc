// The engine (docs/specs/035-pdf-documents/security.md "The boundary"), for wherever a PDF is read: a worker thread in
// a browser, the CLI, tests. The one entry that brings the reader and the writer with it.
import type { PdfEngine } from '../engine-contract';
import { pdfEngineOver } from './engine';
import { startReader } from './reader';

export { pdfDate } from './bake';

/** Starts the engine from the reader's WebAssembly binary. */
export async function createPdfEngine(options: {
  wasm: ArrayBuffer | Uint8Array;
}): Promise<PdfEngine> {
  return pdfEngineOver(await startReader(options.wasm));
}
