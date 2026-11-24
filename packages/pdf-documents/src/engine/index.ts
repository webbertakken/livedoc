// The engine (docs/specs/035-pdf-documents/security.md "The boundary"), for wherever a PDF is read: a worker thread in
// a browser, the CLI, tests. The one entry that brings the reader and the writer with it.
import type { PdfEngine, PdfEngineLog } from '../engine-contract';
import { pdfEngineOver } from './engine';
import { startReader } from './reader';
import type { MarkFaceSource } from './typesetter';

export { pdfDate } from './bake';

/**
 * Starts the engine from the reader's WebAssembly binary; `log` takes what it decides, and is no one by default;
 * `faces` answers the mark faces' files (marks.md "Loading").
 */
export async function createPdfEngine(options: {
  wasm: ArrayBuffer | Uint8Array;
  log?: PdfEngineLog;
  faces?: MarkFaceSource;
}): Promise<PdfEngine> {
  return pdfEngineOver(await startReader(options.wasm), undefined, options.log, options.faces);
}
