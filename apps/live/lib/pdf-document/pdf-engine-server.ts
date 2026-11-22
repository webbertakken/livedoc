// The worker's side of the engine (docs/specs/035-pdf-documents/security.md "The boundary"): every byte of a PDF is
// parsed here, in WebAssembly, off the page's thread. Calls are answered one at a time, in the order they came; a
// call that throws is answered as an error, never left hanging.
import type { PdfEngine, PdfEngineLog } from '@livedoc/pdf-documents';
import type { PdfEngineAnswer, PdfEnginePort, PdfEngineRequest } from './pdf-engine-protocol';

const PLAIN_NAME = /^[A-Za-z]{1,40}$/;

/** A failure by its name alone (security.md "The boundary"): an error's own words may quote the file. */
function nameOf(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  return PLAIN_NAME.test(name) ? name : 'Error';
}

// What an answer hands over rather than copies: a page's pixels, and the boxes of its text. A baked file's bytes are
// copied, since a bake of no changes answers the stored file the engine itself still reads from.
function transferOf(value: unknown): Transferable[] {
  if (typeof value !== 'object' || value === null) return [];
  const { rgba, boxes } = value as {
    rgba?: { buffer: ArrayBuffer };
    boxes?: { buffer: ArrayBuffer };
  };
  return [rgba, boxes].flatMap((held) => (held ? [held.buffer] : []));
}

/**
 * Answers the port's requests from the engine `start` makes, started on the first request. What the engine logs is
 * sent to the page, which writes it; the page is told once the engine has started, since its wait until then is the
 * network's and from then on the engine's own.
 */
export function servePdfEngine(
  port: PdfEnginePort,
  start: (log: PdfEngineLog) => Promise<PdfEngine>,
): void {
  let engine: Promise<PdfEngine> | null = null;
  let queue: Promise<void> = Promise.resolve();
  const begin = async (): Promise<PdfEngine> => {
    const started = await start((line) => port.postMessage({ log: line }, []));
    port.postMessage({ ready: true }, []);
    return started;
  };

  const answer = async (request: PdfEngineRequest): Promise<void> => {
    let message: PdfEngineAnswer;
    try {
      engine ??= begin();
      const started = await engine;
      const call = started[request.method] as (...args: unknown[]) => Promise<unknown>;
      const value = (await call(...request.args)) as PdfEngineAnswer extends { value: infer V }
        ? V
        : never;
      message = { id: request.id, ok: true, value, held: await started.heldBytes() };
    } catch (error) {
      message = { id: request.id, ok: false, error: nameOf(error) };
    }
    port.postMessage(message, message.ok ? transferOf(message.value) : []);
  };

  port.onmessage = ({ data }) => {
    queue = queue.then(() => answer(data));
  };
}
