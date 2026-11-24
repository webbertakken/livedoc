// docs/specs/035-pdf-documents/security.md "The boundary": the engine's one interface over a worker thread. The two
// sides are joined here by a port that hands messages across as a worker's would, around the real engine.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPdfEngine } from '@livedoc/pdf-documents/engine';
import {
  PDF_ENGINE_TIMEOUT_MS,
  PDF_WORKER_MAX_BYTES,
  PDF_WORKER_PHONE_MAX_BYTES,
  type PdfEngine,
  type PdfEngineLog,
} from '@livedoc/pdf-documents';
import {
  FIXTURE_LINE,
  linksPdf,
  marksPdf,
  outlinePdf,
  protectedPdf,
  readerWasm,
  textPdf,
} from '@livedoc/pdf-documents/testing';
import { debugLog } from '@/lib/debug-log';
import { pdfEngineClient, pdfWorkerCeiling, type PdfEngineWorker } from './pdf-engine-client';
import type { PdfEngineMessage, PdfEnginePort, PdfEngineRequest } from './pdf-engine-protocol';
import { servePdfEngine } from './pdf-engine-server';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const wasm = readerWasm;
const twoPages = () => textPdf(2);
const logged = () => vi.mocked(debugLog).mock.calls.map(([line]) => line);

afterEach(() => {
  vi.mocked(debugLog).mockClear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A worker and its page, joined: each message is cloned as it crosses, as a worker's is. */
function joined(start: (log: PdfEngineLog) => Promise<PdfEngine>) {
  const transfers: Transferable[][] = [];
  // Everything that crossed, each way, as the text it would be on a wire.
  const toPage: string[] = [];
  const toWorker: string[] = [];
  const wire = (message: unknown): string =>
    JSON.stringify(message, (_, value: unknown) =>
      ArrayBuffer.isView(value) ? `<${value.byteLength} bytes>` : value,
    );
  const port: PdfEnginePort = {
    onmessage: null,
    postMessage: (message, transfer) => {
      transfers.push(transfer);
      toPage.push(wire(message));
      queueMicrotask(() =>
        worker.onmessage?.({
          data: structuredClone<PdfEngineMessage>(message),
        }),
      );
    },
  };
  const worker: PdfEngineWorker = {
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
    postMessage: (message) => {
      toWorker.push(wire(message));
      queueMicrotask(() => port.onmessage?.({ data: structuredClone<PdfEngineRequest>(message) }));
    },
  };
  servePdfEngine(port, start);
  return { worker, transfers, toPage, toWorker };
}

/** A worker that answers only when the test says, and holds what it was asked. */
function silent() {
  const asked: PdfEngineRequest[] = [];
  const worker: PdfEngineWorker = {
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
    postMessage: (message) => asked.push(message),
  };
  const says = (data: PdfEngineMessage) => worker.onmessage?.({ data });
  return { worker, asked, says };
}

describe('the engine over a worker thread', () => {
  it('opens, draws, selects and bakes through the one interface', async () => {
    const { worker, transfers } = joined(() => createPdfEngine({ wasm: wasm() }));
    const engine = pdfEngineClient(worker);
    const bytes = await twoPages();
    const stored = bytes.slice();
    const opened = await engine.open(bytes);
    expect(opened.ok && opened.pages.map((page) => [page.width, page.height])).toEqual([
      [612, 792],
      [612, 792],
    ]);
    const bitmap = await engine.drawPage(0, 0.25);
    expect(bitmap && [bitmap.width, bitmap.height, bitmap.rgba.length]).toEqual([
      153,
      198,
      153 * 198 * 4,
    ]);
    // A page's pixels are handed over, never copied.
    expect(transfers.some((transfer) => transfer.length === 1)).toBe(true);
    expect(await engine.drawPage(9, 1)).toBeNull();
    // A page's text crosses with a box a unit, its boxes handed over as its pixels are.
    const text = await engine.pageText(0);
    expect(text?.text.startsWith(FIXTURE_LINE)).toBe(true);
    expect(text?.boxes).toHaveLength(text!.text.length * 4);
    expect(transfers.filter((transfer) => transfer.length === 1)).toHaveLength(2);
    const selected = await engine.selectText(0, { x: 72, y: 725 }, { x: 200, y: 725 });
    expect(selected?.text).toBe(FIXTURE_LINE.slice(0, selected?.text.length));
    expect(selected?.text.length).toBeGreaterThan(3);
    expect(await engine.fileMarks(0)).toEqual([]);
    // A page's matrix crosses as six numbers.
    expect(await engine.pageMatrix(0)).toEqual([1, 0, 0, -1, 0, 792]);
    // What a file holds besides its pages crosses as plain values: this one holds none of it.
    expect(await engine.fields(0)).toEqual([]);
    expect(await engine.signatures()).toEqual([]);
    expect(await engine.embeddedFiles()).toEqual({ files: [], cut: false });
    expect(await engine.layers()).toEqual([]);
    expect(await engine.canAppend()).toBe(true);
    expect(await engine.repaired()).toBe(false);
    // No changes: the stored file itself, and still there to bake again.
    const empty = Uint8Array.of(0, 0);
    for (const _ of [1, 2]) {
      const baked = await engine.bake(empty);
      expect(baked.ok && baked.kind).toBe('unchanged');
      expect(baked.ok && baked.bytes).toEqual(stored);
    }
    // Printing: a page cut from the file, as a PDF of its own.
    const cut = await engine.cutPages(stored, [1]);
    expect(new TextDecoder().decode(cut!.subarray(0, 5))).toBe('%PDF-');
    await engine.close();
    expect(engine.stopped).toBe(false);
  });

  // opening.md "Passwords": the password is given to the engine that already holds the file.
  it('gives a password to the worker that holds the file', async () => {
    const { worker } = joined(() => createPdfEngine({ wasm: wasm() }));
    const engine = pdfEngineClient(worker);
    const locked = await protectedPdf({ userPassword: 'open' });
    expect(await engine.open(locked)).toEqual({ ok: false, needsPassword: true });
    expect(await engine.unlock('wrong')).toEqual({ ok: false, needsPassword: true, wrong: true });
    const opened = await engine.unlock('open');
    expect(opened.ok && opened.document.encrypted).toBe(true);
  });

  // security.md "Links and actions": what crosses is where a link leads, as plain values; nothing is followed.
  it('reads the outline and a page’s links across the worker', async () => {
    const engine = pdfEngineClient(joined(() => createPdfEngine({ wasm: wasm() })).worker);
    await engine.open(outlinePdf());
    expect((await engine.outline()).items.map((item) => item.title)).toContain('Website');
    await engine.open(linksPdf());
    expect((await engine.links(0)).map((link) => link.target.kind)).toEqual([
      'place',
      'address',
      'refused',
      'file',
      'action',
    ]);
  });

  it('starts the engine once, on the first call', async () => {
    const start = vi.fn(() => createPdfEngine({ wasm: wasm() }));
    const engine = pdfEngineClient(joined(start).worker);
    expect(start).not.toHaveBeenCalled();
    await Promise.all([engine.fileMarks(0), engine.fileMarks(1)]);
    expect(start).toHaveBeenCalledTimes(1);
  });

  // opening.md "Refusals": the engine trapped, or never started: `pdf_stopped`, and every call still answers.
  it('answers every call as stopped once the worker stops, and says so once', async () => {
    const stopped = vi.fn();
    const { worker, toPage } = joined(async () => {
      // An error's own words may quote the file: only its name crosses, and only its name is logged.
      throw new RangeError('out of memory near "a line of the file"');
    });
    const engine = pdfEngineClient(worker, stopped);
    expect(await engine.open(await twoPages())).toEqual({ ok: false, refusal: 'pdf_stopped' });
    expect(engine.stopped).toBe(true);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(await engine.unlock('a password')).toEqual({ ok: false, refusal: 'pdf_stopped' });
    expect(await engine.drawPage(0, 1)).toBeNull();
    expect(await engine.pageText(0)).toBeNull();
    expect(await engine.outline()).toEqual({ items: [], cut: false });
    expect(await engine.links(0)).toEqual([]);
    expect(await engine.pageMatrix(0)).toBeNull();
    expect(await engine.selectText(0, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
    expect(await engine.fileMarks(0)).toEqual([]);
    expect(await engine.fields(0)).toEqual([]);
    expect(await engine.signatures()).toEqual([]);
    expect(await engine.embeddedFiles()).toEqual({ files: [], cut: false });
    expect(await engine.layers()).toEqual([]);
    expect(await engine.canAppend()).toBe(false);
    expect(await engine.repaired()).toBe(false);
    expect(await engine.bake(Uint8Array.of(0, 0))).toEqual({ ok: false, refusal: 'unreadable' });
    expect(await engine.cutPages(Uint8Array.of(0), [0])).toBeNull();
    expect(await engine.heldBytes()).toBe(0);
    expect(stopped.mock.calls).toEqual([['trap']]);
    expect(logged()).toEqual(['[pdf] worker-restarted reason=trap detail=RangeError']);
    expect(toPage.join('\n')).not.toContain('a line of the file');
  });

  it('names a failure that is no error, or has no plain name, only as an error', async () => {
    for (const thrown of [
      'a line of the file',
      Object.assign(new Error('x'), { name: 'a b\nc' }),
    ]) {
      vi.mocked(debugLog).mockClear();
      // A library may fail with anything at all, an error or not.
      const failing: PromiseLike<PdfEngine> = {
        then: (_, refuse) => Promise.resolve(refuse?.(thrown)) as never,
      };
      const { worker } = joined(async () => failing);
      await pdfEngineClient(worker).close();
      expect(logged()).toEqual(['[pdf] worker-restarted reason=trap detail=Error']);
    }
  });

  it('treats a worker’s own error as a stop, settling what was asked', async () => {
    const stopped = vi.fn();
    const worker: PdfEngineWorker = {
      onmessage: null,
      onerror: null,
      terminate: vi.fn(),
      postMessage: () => {},
    };
    const engine = pdfEngineClient(worker, stopped);
    const drawing = engine.drawPage(0, 1);
    worker.onerror?.({ message: 'worker crashed near "a line of the file"' });
    expect(await drawing).toBeNull();
    expect(stopped.mock.calls).toEqual([['trap']]);
    expect(logged()).toEqual(['[pdf] worker-restarted reason=trap detail=WorkerError']);
    worker.onerror?.('again');
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it('ends quietly when the surface closes it, and ignores answers nobody waits for', async () => {
    const stopped = vi.fn();
    const { worker } = joined(() => createPdfEngine({ wasm: wasm() }));
    const engine = pdfEngineClient(worker, stopped);
    worker.onmessage?.({ data: { id: 99, ok: true, value: null, held: 0 } });
    engine.terminate();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(stopped).not.toHaveBeenCalled();
    expect((await engine.open(await twoPages())).ok).toBe(false);
  });
});

// security.md "The boundary": the engine is held to a time and to a size by the page that started it.
describe('the engine held to a time', () => {
  const opening = async () => {
    vi.useFakeTimers();
    const stopped = vi.fn();
    const { worker, asked, says } = silent();
    const engine = pdfEngineClient(worker, stopped);
    const open = engine.open(await twoPages());
    return { stopped, worker, asked, says, engine, open };
  };

  // security.md "Abuse cases": a parser hang ends the worker: `pdf_stopped`.
  it('ends a worker that answers nothing for the limit while a call waits', async () => {
    const { stopped, worker, says, engine, open } = await opening();
    says({ ready: true });
    vi.advanceTimersByTime(PDF_ENGINE_TIMEOUT_MS - 1);
    expect(worker.terminate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(await open).toEqual({ ok: false, refusal: 'pdf_stopped' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(engine.stopped).toBe(true);
    expect(stopped.mock.calls).toEqual([['timeout']]);
    expect(logged()).toEqual(['[pdf] worker-restarted reason=timeout detail=Silence']);
  });

  it('gives each call its own time: an answer starts the count again', async () => {
    const { worker, asked, says, engine, open } = await opening();
    says({ ready: true });
    const drawing = engine.drawPage(0, 1);
    vi.advanceTimersByTime(PDF_ENGINE_TIMEOUT_MS - 1);
    says({ id: asked[0]!.id, ok: true, value: { ok: false, refusal: 'pdf_damaged' }, held: 1 });
    expect(await open).toEqual({ ok: false, refusal: 'pdf_damaged' });
    vi.advanceTimersByTime(PDF_ENGINE_TIMEOUT_MS - 1);
    expect(worker.terminate).not.toHaveBeenCalled();
    says({ id: asked[1]!.id, ok: true, value: null, held: 1 });
    expect(await drawing).toBeNull();
    // Nothing waits: a worker left alone for an hour is not ended.
    vi.advanceTimersByTime(3_600_000);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it('is not kept alive by what is asked of it: a call asked later does not start the count again', async () => {
    const { worker, says, engine, open } = await opening();
    says({ ready: true });
    vi.advanceTimersByTime(PDF_ENGINE_TIMEOUT_MS - 1);
    const drawing = engine.drawPage(0, 1);
    vi.advanceTimersByTime(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(await open).toEqual({ ok: false, refusal: 'pdf_stopped' });
    expect(await drawing).toBeNull();
  });

  it('counts no time while the engine is still loading: that wait is the network’s', async () => {
    const { worker, asked, says, open } = await opening();
    vi.advanceTimersByTime(PDF_ENGINE_TIMEOUT_MS * 10);
    expect(worker.terminate).not.toHaveBeenCalled();
    says({ ready: true });
    vi.advanceTimersByTime(PDF_ENGINE_TIMEOUT_MS - 1);
    says({ id: asked[0]!.id, ok: true, value: { ok: false, refusal: 'pdf_newer' }, held: 1 });
    expect(await open).toEqual({ ok: false, refusal: 'pdf_newer' });
  });

  it('stops counting when the surface closes it', async () => {
    const { stopped, says, engine } = await opening();
    says({ ready: true });
    engine.terminate();
    vi.advanceTimersByTime(PDF_ENGINE_TIMEOUT_MS * 2);
    expect(stopped).not.toHaveBeenCalled();
  });
});

describe('the engine held to a size', () => {
  // security.md "Abuse cases": a file that asks for too much memory ends the worker: `pdf_stopped`.
  it('ends a worker whose reader holds more than the ceiling, the call that found it answered as stopped', async () => {
    const stopped = vi.fn();
    const { worker, asked, says } = silent();
    const engine = pdfEngineClient(worker, stopped, { timeoutMs: 1_000, maxBytes: 1_000 });
    const open = engine.open(await twoPages());
    says({ id: asked[0]!.id, ok: true, value: { ok: false, refusal: 'pdf_damaged' }, held: 1_001 });
    expect(await open).toEqual({ ok: false, refusal: 'pdf_stopped' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(stopped.mock.calls).toEqual([['memory']]);
    expect(logged()).toEqual(['[pdf] worker-restarted reason=memory detail=held=1001']);
  });

  it('says with every answer what the reader holds, and lets a worker under the ceiling be', async () => {
    const { worker, toPage } = joined(() => createPdfEngine({ wasm: wasm() }));
    const engine = pdfEngineClient(worker);
    await engine.open(await twoPages());
    const held = await engine.heldBytes();
    expect(held).toBeGreaterThan(1_000_000);
    expect(held).toBeLessThan(PDF_WORKER_MAX_BYTES);
    expect(toPage.filter((message) => message.includes('"held"'))).toHaveLength(2);
    expect(engine.stopped).toBe(false);
  });

  // opening.md "Limits": a phone says it has 4 GB or less, or says nothing and is touched.
  it('is a phone’s ceiling where the device says it is small, or says nothing and is touched', () => {
    expect(pdfWorkerCeiling({ deviceMemory: 8, coarsePointer: true })).toBe(PDF_WORKER_MAX_BYTES);
    expect(pdfWorkerCeiling({ deviceMemory: 4, coarsePointer: false })).toBe(
      PDF_WORKER_PHONE_MAX_BYTES,
    );
    expect(pdfWorkerCeiling({ deviceMemory: undefined, coarsePointer: true })).toBe(
      PDF_WORKER_PHONE_MAX_BYTES,
    );
    expect(pdfWorkerCeiling({ deviceMemory: undefined, coarsePointer: false })).toBe(
      PDF_WORKER_MAX_BYTES,
    );
  });
});

// security.md "Logging and telemetry"
describe('what the engine logs', () => {
  it('is written by the page that started it, as the engine wrote it', async () => {
    const { worker } = joined((log) => createPdfEngine({ wasm: wasm(), log }));
    const engine = pdfEngineClient(worker);
    await engine.open(marksPdf(20_000));
    await engine.fileMarks(0);
    expect(logged()).toEqual([
      '[pdf] value-clamped what=coordinate count=2',
      '[pdf] value-clamped what=text count=1',
    ]);
  });

  // security.md "Abuse cases": a password kept, logged or sent: no route or log carries it, by test.
  it('never carries a password: it crosses once, to the worker, and comes back in nothing', async () => {
    const password = 'correct horse battery staple';
    const wrong = 'a wrong guess';
    const network = vi.fn(() => {
      throw new Error('the engine asked the network');
    });
    vi.stubGlobal('fetch', network);
    const { worker, toPage, toWorker } = joined((log) => createPdfEngine({ wasm: wasm(), log }));
    const engine = pdfEngineClient(worker);
    expect(await engine.open(await protectedPdf({ userPassword: password }))).toMatchObject({
      needsPassword: true,
    });
    expect(await engine.unlock(wrong)).toMatchObject({ wrong: true });
    expect((await engine.unlock(password)).ok).toBe(true);
    await engine.drawPage(0, 0.25);
    expect((await engine.bake(Uint8Array.of(0, 0))).ok).toBe(true);
    await engine.close();
    for (const secret of [password, wrong]) {
      expect(toWorker.filter((message) => message.includes(secret))).toHaveLength(1);
      expect(toPage.join('\n')).not.toContain(secret);
      expect(logged().join('\n')).not.toContain(secret);
    }
    expect(network).not.toHaveBeenCalled();
  });
});
