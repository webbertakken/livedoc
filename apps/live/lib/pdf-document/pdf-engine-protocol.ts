// What crosses between the page and the engine's worker thread (docs/specs/035-pdf-documents/security.md "The
// boundary"): one request a call of the engine's one interface, one answer each. Bytes and numbers only.
import type { PdfEngine } from '@livedoc/pdf-documents';

export type PdfEngineMethod = keyof PdfEngine;

export type PdfEngineRequest = {
  [M in PdfEngineMethod]: { id: number; method: M; args: Parameters<PdfEngine[M]> };
}[PdfEngineMethod];

export type PdfEngineAnswer =
  | { id: number; ok: true; value: Awaited<ReturnType<PdfEngine[PdfEngineMethod]>> }
  // The call threw inside the worker: the engine trapped, or never started.
  | { id: number; ok: false; error: string };

/** The side of a worker thread a module speaks through. */
export type PdfEnginePort = {
  postMessage: (message: unknown, transfer: Transferable[]) => void;
  onmessage: ((event: { data: PdfEngineRequest }) => void) | null;
};
