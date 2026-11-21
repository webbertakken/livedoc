// The worker's side of the engine (docs/specs/035-pdf-documents/security.md "The boundary"): every byte of a PDF is
// parsed here, in WebAssembly, off the page's thread. Calls are answered one at a time, in the order they came; a
// call that throws is answered as an error, never left hanging.
import type { PdfEngine } from '@livedoc/pdf-documents';
import type { PdfEngineAnswer, PdfEnginePort, PdfEngineRequest } from './pdf-engine-protocol';

// What an answer hands over rather than copies: a page's pixels. A baked file's bytes are copied, since a bake of no
// changes answers the stored file the engine itself still reads from.
function transferOf(value: unknown): Transferable[] {
  if (typeof value !== 'object' || value === null) return [];
  const { rgba } = value as { rgba?: { buffer: ArrayBuffer } };
  return rgba ? [rgba.buffer] : [];
}

/** Answers the port's requests from the engine `start` makes, started on the first request. */
export function servePdfEngine(port: PdfEnginePort, start: () => Promise<PdfEngine>): void {
  let engine: Promise<PdfEngine> | null = null;
  let queue: Promise<void> = Promise.resolve();

  const answer = async (request: PdfEngineRequest): Promise<void> => {
    let message: PdfEngineAnswer;
    try {
      engine ??= start();
      const started = await engine;
      const call = started[request.method] as (...args: unknown[]) => Promise<unknown>;
      const value = (await call(...request.args)) as PdfEngineAnswer extends { value: infer V }
        ? V
        : never;
      message = { id: request.id, ok: true, value };
    } catch (error) {
      message = { id: request.id, ok: false, error: String(error) };
    }
    port.postMessage(message, message.ok ? transferOf(message.value) : []);
  };

  port.onmessage = ({ data }) => {
    queue = queue.then(() => answer(data));
  };
}
