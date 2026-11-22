// What crosses between the page and the engine's worker thread (docs/specs/035-pdf-documents/security.md "The
// boundary"): one request a call of the engine's one interface, one answer each, and what the worker says unasked.
// Bytes, numbers and the engine's own words only.
import type { PdfEngine } from '@livedoc/pdf-documents';

export type PdfEngineMethod = keyof PdfEngine;

export type PdfEngineRequest = {
  [M in PdfEngineMethod]: { id: number; method: M; args: Parameters<PdfEngine[M]> };
}[PdfEngineMethod];

export type PdfEngineAnswer =
  | {
      id: number;
      ok: true;
      value: Awaited<ReturnType<PdfEngine[PdfEngineMethod]>>;
      /** The bytes of memory the engine's reader holds after the call. */
      held: number;
    }
  // The call threw inside the worker: the engine trapped, or never started. `error` is the failure's name, never
  // its message: an error's own words may quote the file.
  | { id: number; ok: false; error: string };

/** What the worker says unasked: that the engine has started, and each line the engine logs. */
export type PdfEngineNote = { ready: true } | { log: string };

export type PdfEngineMessage = PdfEngineAnswer | PdfEngineNote;

/** The side of a worker thread a module speaks through. */
export type PdfEnginePort = {
  postMessage: (message: PdfEngineMessage, transfer: Transferable[]) => void;
  onmessage: ((event: { data: PdfEngineRequest }) => void) | null;
};
