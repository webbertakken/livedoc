// The page's side of the engine (docs/specs/035-pdf-documents/security.md "The boundary"): the engine's one interface
// over a worker thread. Nothing here parses a PDF; what comes back is typed, bounded values. A worker that stops (a
// trap, a crash, a call that threw) answers every call from then on as the engine's own refusals, never a rejection,
// and says so once (opening.md "Refusals": `pdf_stopped`).
import type {
  BakeResult,
  FileMark,
  Outline,
  PageBitmap,
  PageLink,
  PageText,
  PdfEngine,
  PdfOpened,
  TextSelection,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import type { PdfEngineAnswer, PdfEngineMethod, PdfEngineRequest } from './pdf-engine-protocol';

/** The part of a Worker the client uses. */
export type PdfEngineWorker = {
  postMessage: (message: PdfEngineRequest, transfer: Transferable[]) => void;
  onmessage: ((event: { data: PdfEngineAnswer }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  terminate: () => void;
};

export type PdfEngineClient = PdfEngine & {
  /** Ends the worker; every call after answers as stopped. */
  terminate: () => void;
  /** Whether the worker stopped on its own. */
  readonly stopped: boolean;
};

// What each call answers once the worker has stopped.
const STOPPED = {
  open: { ok: false, refusal: 'pdf_stopped' } satisfies PdfOpened,
  unlock: { ok: false, refusal: 'pdf_stopped' } satisfies PdfOpened,
  drawPage: null,
  outline: { items: [], cut: false } satisfies Outline,
  links: [] as readonly PageLink[],
  pageText: null,
  selectText: null,
  fileMarks: [] as readonly FileMark[],
  bake: { ok: false, refusal: 'unreadable' } satisfies BakeResult,
  close: undefined,
} as const;

export function pdfEngineClient(
  worker: PdfEngineWorker,
  onStopped: (reason: string) => void = () => {},
): PdfEngineClient {
  let nextId = 1;
  let stopped = false;
  const pending = new Map<number, { method: PdfEngineMethod; settle: (value: unknown) => void }>();

  const stop = (reason: string, selfStopped: boolean) => {
    if (stopped) return;
    stopped = true;
    for (const { method, settle } of pending.values()) settle(STOPPED[method]);
    pending.clear();
    worker.terminate();
    if (selfStopped) {
      debugLog(`[pdf] worker-restarted reason=trap detail=${reason}`);
      onStopped(reason);
    }
  };

  worker.onmessage = ({ data }) => {
    const call = pending.get(data.id);
    if (!call) return;
    if (!data.ok) return stop(data.error, true);
    pending.delete(data.id);
    call.settle(data.value);
  };
  worker.onerror = (event) => stop(String((event as { message?: unknown }).message ?? event), true);

  const ask = <T>(request: Omit<PdfEngineRequest, 'id'>, transfer: Transferable[] = []) =>
    new Promise<T>((resolve) => {
      if (stopped) return resolve(STOPPED[request.method] as T);
      const id = nextId++;
      pending.set(id, { method: request.method, settle: resolve as (value: unknown) => void });
      worker.postMessage({ ...request, id } as PdfEngineRequest, transfer);
    });

  return {
    // The bytes are handed over, not copied: the engine holds the stored file from here on, and a bake of no
    // changes answers it back.
    open: (bytes) => ask<PdfOpened>({ method: 'open', args: [bytes] }, [bytes.buffer]),
    // The password crosses once, to the worker that holds the file, and is kept nowhere on this side.
    unlock: (password) => ask<PdfOpened>({ method: 'unlock', args: [password] }),
    drawPage: (index, scale) =>
      ask<PageBitmap | null>({ method: 'drawPage', args: [index, scale] }),
    outline: () => ask<Outline>({ method: 'outline', args: [] }),
    links: (index) => ask<readonly PageLink[]>({ method: 'links', args: [index] }),
    pageText: (index) => ask<PageText | null>({ method: 'pageText', args: [index] }),
    selectText: (index, from, to) =>
      ask<TextSelection | null>({ method: 'selectText', args: [index, from, to] }),
    fileMarks: (index) => ask<readonly FileMark[]>({ method: 'fileMarks', args: [index] }),
    bake: (liveChanges) => ask<BakeResult>({ method: 'bake', args: [liveChanges] }),
    close: () => ask<void>({ method: 'close', args: [] }),
    terminate: () => stop('closed', false),
    get stopped() {
      return stopped;
    },
  };
}

/** The engine in a worker thread of its own, started on its first call. */
export function startPdfEngineWorker(onStopped?: (reason: string) => void): PdfEngineClient {
  const worker = new Worker(new URL('./pdf-engine.worker.ts', import.meta.url), {
    type: 'module',
    name: 'pdf-engine',
  });
  return pdfEngineClient(worker as unknown as PdfEngineWorker, onStopped);
}
