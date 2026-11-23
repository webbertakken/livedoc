// The page's side of the engine (docs/specs/035-pdf-documents/security.md "The boundary"): the engine's one interface
// over a worker thread. Nothing here parses a PDF; what comes back is typed, bounded values. The page holds the
// engine to a time and to a size: a worker that answers nothing for too long, or whose reader holds too much, is
// ended here, since a call cannot be stopped inside WebAssembly. A worker that stops (a trap, a crash, a call that
// threw, a limit passed) answers every call from then on as the engine's own refusals, never a rejection, and says
// so once (opening.md "Refusals": `pdf_stopped`).
import {
  PDF_ENGINE_TIMEOUT_MS,
  PDF_WORKER_MAX_BYTES,
  PDF_WORKER_PHONE_MAX_BYTES,
} from '@livedoc/pdf-documents';
import type {
  BakeResult,
  EmbeddedFileRead,
  EmbeddedFiles,
  FileMark,
  FileSignature,
  Outline,
  PageBitmap,
  PageField,
  PageLink,
  PageMatrix,
  PageText,
  PdfEngine,
  PdfLayer,
  PdfOpened,
  TextSelection,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { PdfDevice } from './pdf-device';
import type { PdfEngineMessage, PdfEngineMethod, PdfEngineRequest } from './pdf-engine-protocol';

/** The part of a Worker the client uses. */
export type PdfEngineWorker = {
  postMessage: (message: PdfEngineRequest, transfer: Transferable[]) => void;
  onmessage: ((event: { data: PdfEngineMessage }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  terminate: () => void;
};

export type PdfEngineClient = PdfEngine & {
  /** Ends the worker; every call after answers as stopped. */
  terminate: () => void;
  /** Whether the worker stopped on its own, or was ended for a limit it passed. */
  readonly stopped: boolean;
};

/** Why a worker was ended (opening.md "Telemetry and observability"). */
export type PdfEngineStop = 'trap' | 'timeout' | 'memory';

/** What the page holds its engine to (opening.md "Limits"). */
export type PdfEngineLimits = { readonly timeoutMs: number; readonly maxBytes: number };

const BROWSER_LIMITS: PdfEngineLimits = {
  timeoutMs: PDF_ENGINE_TIMEOUT_MS,
  maxBytes: PDF_WORKER_MAX_BYTES,
};

/**
 * The most memory the engine's reader may hold on this device: a phone's ceiling where the device says it has little
 * memory, or says nothing and is touched, not pointed at (opening.md "Limits").
 */
export function pdfWorkerCeiling(device: PdfDevice): number {
  return PdfDevice.isPhone(device) ? PDF_WORKER_PHONE_MAX_BYTES : PDF_WORKER_MAX_BYTES;
}

// What each call answers once the worker has stopped.
const STOPPED = {
  open: { ok: false, refusal: 'pdf_stopped' } satisfies PdfOpened,
  unlock: { ok: false, refusal: 'pdf_stopped' } satisfies PdfOpened,
  drawPage: null,
  drawTile: null,
  pageMatrix: null,
  outline: { items: [], cut: false } satisfies Outline,
  links: [] as readonly PageLink[],
  pageText: null,
  selectText: null,
  fileMarks: [] as readonly FileMark[],
  fields: [] as readonly PageField[],
  signatures: [] as readonly FileSignature[],
  embeddedFiles: { files: [], cut: false } satisfies EmbeddedFiles,
  embeddedFile: { ok: false, refusal: 'unreadable' } satisfies EmbeddedFileRead,
  layers: [] as readonly PdfLayer[],
  layerView: false,
  canAppend: false,
  repaired: false,
  bake: { ok: false, refusal: 'unreadable' } satisfies BakeResult,
  heldBytes: 0,
  close: undefined,
} as const;

export function pdfEngineClient(
  worker: PdfEngineWorker,
  onStopped: (reason: PdfEngineStop) => void = () => {},
  limits: PdfEngineLimits = BROWSER_LIMITS,
): PdfEngineClient {
  let nextId = 1;
  let stopped = false;
  // Until the engine has started the wait is the network's (its binary is fetched), and no time is counted.
  let ready = false;
  let silence: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<number, { method: PdfEngineMethod; settle: (value: unknown) => void }>();

  const unwatch = () => {
    if (silence !== null) clearTimeout(silence);
    silence = null;
  };

  /** Ends the worker. `reason`: why it stopped on its own or passed a limit; null where the surface closed it. */
  const stop = (reason: PdfEngineStop | null, detail = '') => {
    if (stopped) return;
    stopped = true;
    unwatch();
    for (const { method, settle } of pending.values()) settle(STOPPED[method]);
    pending.clear();
    worker.terminate();
    if (reason === null) return;
    debugLog(`[pdf] worker-restarted reason=${reason} detail=${detail}`);
    onStopped(reason);
  };

  /** Counts the worker's silence from now, for as long as a call waits on a started engine. */
  const watch = () => {
    unwatch();
    if (ready && pending.size > 0)
      silence = setTimeout(() => stop('timeout', 'Silence'), limits.timeoutMs);
  };

  worker.onmessage = ({ data }) => {
    if (stopped) return;
    // The engine's own lines, made of its own words: written here, where the page's logger is.
    if ('log' in data) return debugLog(data.log);
    if ('ready' in data) {
      ready = true;
      return watch();
    }
    const call = pending.get(data.id);
    if (!call) return;
    if (!data.ok) return stop('trap', data.error);
    if (data.held > limits.maxBytes) return stop('memory', `held=${data.held}`);
    pending.delete(data.id);
    call.settle(data.value);
    watch();
  };
  // A worker's own error event carries the thrown error's words, which may quote the file: none of it is kept.
  worker.onerror = () => stop('trap', 'WorkerError');

  const ask = <T>(request: Omit<PdfEngineRequest, 'id'>, transfer: Transferable[] = []) =>
    new Promise<T>((resolve) => {
      if (stopped) return resolve(STOPPED[request.method] as T);
      const id = nextId++;
      pending.set(id, { method: request.method, settle: resolve as (value: unknown) => void });
      worker.postMessage({ ...request, id } as PdfEngineRequest, transfer);
      // A call asked while another runs does not start the count again: a hung worker is not kept alive by asking.
      if (silence === null) watch();
    });

  return {
    // The bytes are handed over, not copied: the engine holds the stored file from here on, and a bake of no
    // changes answers it back.
    open: (bytes) => ask<PdfOpened>({ method: 'open', args: [bytes] }, [bytes.buffer]),
    // The password crosses once, to the worker that holds the file, and is kept nowhere on this side.
    unlock: (password) => ask<PdfOpened>({ method: 'unlock', args: [password] }),
    drawPage: (index, scale, turns, hidden) =>
      ask<PageBitmap | null>({ method: 'drawPage', args: [index, scale, turns, hidden] }),
    drawTile: (index, scale, turns, rect, hidden) =>
      ask<PageBitmap | null>({ method: 'drawTile', args: [index, scale, turns, rect, hidden] }),
    outline: () => ask<Outline>({ method: 'outline', args: [] }),
    pageMatrix: (index, turns) =>
      ask<PageMatrix | null>({ method: 'pageMatrix', args: [index, turns] }),
    links: (index) => ask<readonly PageLink[]>({ method: 'links', args: [index] }),
    pageText: (index) => ask<PageText | null>({ method: 'pageText', args: [index] }),
    selectText: (index, from, to) =>
      ask<TextSelection | null>({ method: 'selectText', args: [index, from, to] }),
    fileMarks: (index) => ask<readonly FileMark[]>({ method: 'fileMarks', args: [index] }),
    fields: (index) => ask<readonly PageField[]>({ method: 'fields', args: [index] }),
    signatures: () => ask<readonly FileSignature[]>({ method: 'signatures', args: [] }),
    embeddedFiles: () => ask<EmbeddedFiles>({ method: 'embeddedFiles', args: [] }),
    embeddedFile: (at) => ask<EmbeddedFileRead>({ method: 'embeddedFile', args: [at] }),
    layers: () => ask<readonly PdfLayer[]>({ method: 'layers', args: [] }),
    layerView: (hidden) => ask<boolean>({ method: 'layerView', args: [hidden] }),
    canAppend: () => ask<boolean>({ method: 'canAppend', args: [] }),
    repaired: () => ask<boolean>({ method: 'repaired', args: [] }),
    bake: (liveChanges) => ask<BakeResult>({ method: 'bake', args: [liveChanges] }),
    heldBytes: () => ask<number>({ method: 'heldBytes', args: [] }),
    close: () => ask<void>({ method: 'close', args: [] }),
    terminate: () => stop(null),
    get stopped() {
      return stopped;
    },
  };
}

/** The engine in a worker thread of its own, started on its first call, held to this device's limits. */
export function startPdfEngineWorker(onStopped?: (reason: PdfEngineStop) => void): PdfEngineClient {
  const worker = new Worker(new URL('./pdf-engine.worker.ts', import.meta.url), {
    type: 'module',
    name: 'pdf-engine',
  });
  const maxBytes = pdfWorkerCeiling(PdfDevice.current());
  return pdfEngineClient(worker as unknown as PdfEngineWorker, onStopped, {
    timeoutMs: PDF_ENGINE_TIMEOUT_MS,
    maxBytes,
  });
}
