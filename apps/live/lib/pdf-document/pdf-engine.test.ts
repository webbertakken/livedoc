// docs/specs/035-pdf-documents/security.md "The boundary": the engine's one interface over a worker thread. The two
// sides are joined here by a port that hands messages across as a worker's would, around the real engine.
import { describe, expect, it, vi } from 'vitest';
import { createPdfEngine } from '@livedoc/pdf-documents/engine';
import type { PdfEngine } from '@livedoc/pdf-documents';
import {
  FIXTURE_LINE,
  linksPdf,
  outlinePdf,
  protectedPdf,
  readerWasm,
  textPdf,
} from '@livedoc/pdf-documents/testing';
import { pdfEngineClient, type PdfEngineWorker } from './pdf-engine-client';
import type { PdfEngineAnswer, PdfEnginePort, PdfEngineRequest } from './pdf-engine-protocol';
import { servePdfEngine } from './pdf-engine-server';

const wasm = readerWasm;
const twoPages = () => textPdf(2);

/** A worker and its page, joined: each message is cloned as it crosses, as a worker's is. */
function joined(start: () => Promise<PdfEngine>) {
  const transfers: Transferable[][] = [];
  const port: PdfEnginePort = {
    onmessage: null,
    postMessage: (message, transfer) => {
      transfers.push(transfer);
      queueMicrotask(() =>
        worker.onmessage?.({ data: structuredClone<PdfEngineAnswer>(message as PdfEngineAnswer) }),
      );
    },
  };
  const worker: PdfEngineWorker = {
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
    postMessage: (message) =>
      queueMicrotask(() => port.onmessage?.({ data: structuredClone<PdfEngineRequest>(message) })),
  };
  servePdfEngine(port, start);
  return { worker, transfers };
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
    // No changes: the stored file itself, and still there to bake again.
    const empty = Uint8Array.of(0, 0);
    for (const _ of [1, 2]) {
      const baked = await engine.bake(empty);
      expect(baked.ok && baked.kind).toBe('unchanged');
      expect(baked.ok && baked.bytes).toEqual(stored);
    }
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
    const { worker } = joined(async () => {
      throw new Error('out of memory');
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
    expect(await engine.selectText(0, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
    expect(await engine.fileMarks(0)).toEqual([]);
    expect(await engine.bake(Uint8Array.of(0, 0))).toEqual({ ok: false, refusal: 'unreadable' });
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(stopped.mock.calls[0]![0]).toContain('out of memory');
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
    worker.onerror?.({ message: 'worker crashed' });
    expect(await drawing).toBeNull();
    expect(stopped).toHaveBeenCalledWith('worker crashed');
    worker.onerror?.('again');
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it('ends quietly when the surface closes it, and ignores answers nobody waits for', async () => {
    const stopped = vi.fn();
    const { worker } = joined(() => createPdfEngine({ wasm: wasm() }));
    const engine = pdfEngineClient(worker, stopped);
    worker.onmessage?.({ data: { id: 99, ok: true, value: null } });
    engine.terminate();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(stopped).not.toHaveBeenCalled();
    expect((await engine.open(await twoPages())).ok).toBe(false);
  });
});
