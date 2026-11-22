// @vitest-environment jsdom
// docs/specs/035-pdf-documents/opening.md "While it opens", "Refusals"; live-editing-and-storage.md "The layout": the
// state names its stored file, that file is fetched and opened, and only then are the live changes loaded and bound.
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import { PageName, PdfLiveChanges, type PdfOpened } from '@livedoc/pdf-documents';
import { ApiError } from '@/lib/api/core';
import type { PdfEngineClient } from './pdf-engine-client';
import { unboundPdfLiveChanges, type BindPdfLiveChanges } from './pdf-live-binding';
import { usePdfDocument, type PdfDocumentDeps } from './usePdfDocument';

const KEY = 'ab'.repeat(32) as BlobKey;
const scope = { ownerId: 'ada', documentId: 'D', tabId: 't1', shareCode: null };
const PAGES = [{ name: PageName.ofObject(3), width: 612, height: 792 }];
const read = () => ({
  update: PdfLiveChanges.merge([]),
  stateVector: new Uint8Array(),
  storedFile: KEY,
});

function engineThat(opens: PdfOpened) {
  let stop: (reason: string) => void = () => {};
  const engine = {
    open: vi.fn(async () => opens),
    drawPage: vi.fn(async () => null),
    selectText: vi.fn(async () => null),
    fileMarks: vi.fn(async () => []),
    bake: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
    stopped: false,
  } as unknown as PdfEngineClient;
  const startEngine: PdfDocumentDeps['startEngine'] = (onStopped) => {
    stop = onStopped;
    return engine;
  };
  return { engine, startEngine, stop: (reason: string) => stop(reason) };
}

function opening(
  over: Partial<PdfDocumentDeps> & { opens?: PdfOpened; bind?: BindPdfLiveChanges } = {},
) {
  const made = engineThat(over.opens ?? { ok: true, pages: PAGES });
  const deps: PdfDocumentDeps = {
    loadState: vi.fn(async () => read()),
    readBlob: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
    startEngine: made.startEngine,
    ...over,
  };
  const bind = vi.fn(over.bind ?? unboundPdfLiveChanges);
  const hook = renderHook(({ attempt }) => usePdfDocument(scope, bind, attempt, deps), {
    initialProps: { attempt: 0 },
  });
  return { ...made, deps, bind, hook };
}

const phase = (o: ReturnType<typeof opening>) => o.hook.result.current.phase;

describe('usePdfDocument', () => {
  it('reads the state, fetches the file it names, opens it, then binds the live changes', async () => {
    const o = opening();
    expect(phase(o)).toBe('opening');
    await waitFor(() => expect(phase(o)).toBe('ready'));
    const open = o.hook.result.current;
    if (open.phase !== 'ready') throw new Error('not ready');
    expect(open.pages).toEqual(PAGES);
    expect([open.storedFile, open.bytes]).toEqual([KEY, 4]);
    expect(o.deps.readBlob).toHaveBeenCalledWith(scope, KEY);
    // No live change is loaded until the engine has opened the file.
    expect(o.bind.mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(o.engine.open).mock.invocationCallOrder[0]!,
    );
    o.hook.unmount();
    expect(o.engine.terminate).toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, refusal: 'pdf_damaged' }, 'pdf_damaged'],
    [{ ok: false, refusal: 'pdf_certificate_protected' }, 'pdf_certificate_protected'],
    [{ ok: false, needsPassword: true }, 'pdf_password'],
  ] as const)('shows the engine’s refusal %j by name, the file still held', async (opens, name) => {
    const o = opening({ opens });
    await waitFor(() => expect(phase(o)).toBe('refused'));
    expect(o.hook.result.current).toEqual({ phase: 'refused', refusal: name, storedFile: KEY });
    expect(o.bind).not.toHaveBeenCalled();
  });

  it.each(['blob_missing', 'files_unavailable'] as const)(
    'names bytes that cannot be read as %s, with nothing to download',
    async (code) => {
      const o = opening({
        readBlob: async () => {
          throw new ApiError('file read', 404, code);
        },
      });
      await waitFor(() => expect(phase(o)).toBe('refused'));
      expect(o.hook.result.current).toEqual({ phase: 'refused', refusal: code, storedFile: null });
    },
  );

  it('says the tab is gone when it is no PDF tab of the document any more', async () => {
    const o = opening({
      loadState: async () => {
        throw new ApiError('PDF state', 404, 'pdf_not_found');
      },
    });
    await waitFor(() => expect(phase(o)).toBe('gone'));
  });

  it('fails, to be tried again, when the state, the bytes or the binding cannot be reached', async () => {
    const offline = async () => {
      throw new TypeError('network');
    };
    for (const over of [{ loadState: offline }, { readBlob: offline }, { bind: offline }]) {
      const o = opening(over);
      await waitFor(() => expect(phase(o)).toBe('failed'));
      o.hook.unmount();
    }
  });

  it('reads once more on a new attempt', async () => {
    const loadState = vi
      .fn<PdfDocumentDeps['loadState']>()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValue(read());
    const o = opening({ loadState });
    await waitFor(() => expect(phase(o)).toBe('failed'));
    o.hook.rerender({ attempt: 1 });
    expect(phase(o)).toBe('opening');
    await waitFor(() => expect(phase(o)).toBe('ready'));
  });

  // "After pdf_stopped the worker is ended": a worker that stops while a PDF is open says so in the pages' place.
  it('shows pdf_stopped when the engine’s worker stops', async () => {
    const o = opening();
    await waitFor(() => expect(phase(o)).toBe('ready'));
    o.stop('trap');
    await waitFor(() => expect(phase(o)).toBe('refused'));
    expect(o.hook.result.current).toMatchObject({ refusal: 'pdf_stopped', storedFile: KEY });
  });

  it('closes a binding that arrives after the surface has gone', async () => {
    const close = vi.fn();
    let release: () => void = () => {};
    const o = opening({
      bind: (state) =>
        new Promise((resolve) => {
          release = () =>
            void unboundPdfLiveChanges(state).then((bound) => resolve({ ...bound, close }));
        }),
    });
    await waitFor(() => expect(o.bind).toHaveBeenCalled());
    o.hook.unmount();
    release();
    await waitFor(() => expect(close).toHaveBeenCalled());
  });
});
