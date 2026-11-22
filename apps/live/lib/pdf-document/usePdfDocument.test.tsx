// @vitest-environment jsdom
// docs/specs/035-pdf-documents/opening.md "While it opens", "Refusals"; live-editing-and-storage.md "The layout": the
// state names its stored file, that file is fetched and opened, and only then are the live changes loaded and bound.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import { PageName, PdfLiveChanges, type PageInfo, type PdfOpened } from '@livedoc/pdf-documents';
import { plainDocument } from '@livedoc/pdf-documents/testing';
import { ApiError } from '@/lib/api/core';
import type { PdfEngineClient, PdfEngineStop } from './pdf-engine-client';
import type { PdfDocumentRefusal } from './pdf-document-bus';
import { unboundPdfLiveChanges, type BindPdfLiveChanges } from './pdf-live-binding';
import { usePdfDocument, type PdfDocumentDeps } from './usePdfDocument';

const KEY = 'ab'.repeat(32) as BlobKey;
const scope = { ownerId: 'ada', documentId: 'D', tabId: 't1', shareCode: null };
const PAGES: readonly PageInfo[] = [
  { name: PageName.ofObject(3), width: 612, height: 792, rotation: 0, label: null },
];
const read = () => ({
  update: PdfLiveChanges.merge([]),
  stateVector: new Uint8Array(),
  storedFile: KEY,
});

function engineThat(opens: PdfOpened) {
  let stop: (reason: PdfEngineStop) => void = () => {};
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
  return { engine, startEngine, stop: (reason: PdfEngineStop) => stop(reason) };
}

function opening(
  over: Partial<PdfDocumentDeps> & { opens?: PdfOpened; bind?: BindPdfLiveChanges } = {},
) {
  const made = engineThat(over.opens ?? { ok: true, pages: PAGES, document: plainDocument });
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

const readyOf = (o: ReturnType<typeof opening>) => {
  const open = o.hook.result.current;
  if (open.phase !== 'ready') throw new Error(`not ready: ${open.phase}`);
  return open;
};

/** A binding whose refusals the test fires, counting what was discarded and closed. */
function refusable() {
  const made: { refuse: (refusal: PdfDocumentRefusal) => void }[] = [];
  const discard = vi.fn(async () => {});
  const close = vi.fn();
  const bind: BindPdfLiveChanges = async (state) => {
    const listeners = new Set<(refusal: PdfDocumentRefusal) => void>();
    made.push({ refuse: (refusal) => [...listeners].forEach((listener) => listener(refusal)) });
    return {
      ...(await unboundPdfLiveChanges(state)),
      discard,
      close,
      onRefused: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  };
  return { bind, made, discard, close };
}

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

  // live-editing-and-storage.md "Limits": a refused change is dropped; the live changes are read again, in place.
  it('drops a refused change: discards the binding and binds the state again, the pages staying', async () => {
    const live = refusable();
    const o = opening({ bind: live.bind });
    await waitFor(() => expect(phase(o)).toBe('ready'));
    const first = readyOf(o);
    const dropped = vi.fn();
    const stop = first.onDropped(dropped);
    act(() => live.made[0]!.refuse('level_too_low'));
    await waitFor(() => expect(dropped).toHaveBeenCalledWith('level_too_low'));
    const second = readyOf(o);
    expect(live.discard).toHaveBeenCalledTimes(1);
    expect(o.deps.loadState).toHaveBeenCalledTimes(2);
    expect(o.deps.readBlob).toHaveBeenCalledTimes(1);
    expect(second.binding).not.toBe(first.binding);
    expect(second.engine).toBe(first.engine);
    expect(second.onDropped).toBe(first.onDropped);
    // The discarded binding's refusals are no longer heard; the new one's are.
    act(() => live.made[0]!.refuse('state'));
    expect(o.deps.loadState).toHaveBeenCalledTimes(2);
    stop();
    act(() => live.made[1]!.refuse('state'));
    await waitFor(() => expect(o.deps.loadState).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(live.made).toHaveLength(3));
    expect(dropped).toHaveBeenCalledTimes(1);
  });

  it('fails, to be tried again, when the state cannot be read after a refusal', async () => {
    const live = refusable();
    const o = opening({ bind: live.bind });
    await waitFor(() => expect(phase(o)).toBe('ready'));
    vi.mocked(o.deps.loadState).mockRejectedValueOnce(new Error('offline'));
    act(() => live.made[0]!.refuse('state'));
    await waitFor(() => expect(phase(o)).toBe('failed'));
  });

  it('opens the stored file anew when the state names another after a refusal', async () => {
    const live = refusable();
    const o = opening({ bind: live.bind });
    await waitFor(() => expect(phase(o)).toBe('ready'));
    const other = 'cd'.repeat(32) as BlobKey;
    vi.mocked(o.deps.loadState).mockResolvedValue({ ...read(), storedFile: other });
    act(() => live.made[0]!.refuse('state'));
    await waitFor(() => expect(o.deps.readBlob).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(phase(o)).toBe('ready'));
    expect(readyOf(o).storedFile).toBe(other);
    expect(o.engine.terminate).toHaveBeenCalled();
  });

  it('binds nothing anew once the surface has gone, mid-drop', async () => {
    const live = refusable();
    let release: () => void = () => {};
    live.discard.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const o = opening({ bind: live.bind });
    await waitFor(() => expect(phase(o)).toBe('ready'));
    act(() => live.made[0]!.refuse('state'));
    o.hook.unmount();
    release();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(o.deps.loadState).toHaveBeenCalledTimes(1);
    expect(live.close).not.toHaveBeenCalled();
  });

  it('closes a binding made after the surface has gone, mid-drop', async () => {
    const live = refusable();
    const o = opening({ bind: live.bind });
    await waitFor(() => expect(phase(o)).toBe('ready'));
    let release: (state: ReturnType<typeof read>) => void = () => {};
    vi.mocked(o.deps.loadState).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    act(() => live.made[0]!.refuse('state'));
    await waitFor(() => expect(o.deps.loadState).toHaveBeenCalledTimes(2));
    o.hook.unmount();
    release(read());
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(live.made).toHaveLength(1);
  });
});
