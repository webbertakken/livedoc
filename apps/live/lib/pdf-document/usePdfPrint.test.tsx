// @vitest-environment jsdom
// docs/specs/035-pdf-documents/files-print-and-sync.md "Printing": Print and ⌘P open LiveDoc's dialog; a file that asks
// not to be printed dims Print with the reason and ⌘P says it; a print made is handed to the browser and counted, one
// that cannot be made is said; a browser that shows no PDF, or a file that allows a rough print only, gets pictures.
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PageName, PdfLiveChanges, PdfPermissions, type PageInfo } from '@livedoc/pdf-documents';
import { track } from '@/lib/telemetry';
import { PRINT } from './pdf-menus';
import { makePrint } from './pdf-print';
import { printInFrame } from './print-frame';
import {
  PRINT_FAILED_COPY,
  PRINT_NOT_ALLOWED_LABEL,
  PRINT_REFUSED_COPY,
  usePdfPrint,
  type PdfPrintSource,
} from './usePdfPrint';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('./pdf-print', () => ({ makePrint: vi.fn() }));
vi.mock('./print-frame', () => ({ printInFrame: vi.fn(async () => {}) }));
vi.mock('./pdf-thumbnail-canvas', () => ({ encodePdfThumbnail: vi.fn() }));

const PAGE: PageInfo = {
  name: PageName.ofObject(3),
  width: 612,
  height: 792,
  rotation: 0,
  label: null,
};

function source(permissions = PdfPermissions.all()): PdfPrintSource {
  return {
    engine: { bake: vi.fn(), cutPages: vi.fn(), drawPage: vi.fn() },
    doc: PdfLiveChanges.load(),
    pages: [PAGE],
    permissions,
    marksOn: () => [],
    readStored: async () => Uint8Array.of(1),
  };
}

function printing(given: PdfPrintSource | null = source()) {
  const onProblem = vi.fn();
  const hook = renderHook(() =>
    usePdfPrint({
      source: given,
      documentName: 'Lease',
      onProblem,
    }),
  );
  return { hook, onProblem };
}

const key = (over: Partial<KeyboardEvent<HTMLElement>> = {}) =>
  ({
    key: 'p',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...over,
  }) as unknown as KeyboardEvent<HTMLElement>;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'pdfViewerEnabled', { value: true, configurable: true });
});

describe('usePdfPrint', () => {
  it('opens the dialog from Print and ⌘P, and prints what is chosen', async () => {
    vi.mocked(makePrint).mockResolvedValue({ ok: true, way: 'pdf', bytes: Uint8Array.of(7) });
    const { hook } = printing();
    act(() => hook.result.current.actions[PRINT]!.run());
    expect(hook.result.current.dialog.open).toBe(true);
    act(() => hook.result.current.dialog.onClose());
    const pressed = key();
    act(() => {
      expect(hook.result.current.onKey(pressed)).toBe(true);
    });
    expect(pressed.preventDefault).toHaveBeenCalled();
    expect(hook.result.current.dialog.open).toBe(true);

    await act(async () => hook.result.current.dialog.onPrint({ pages: [0], marks: false }));
    expect(hook.result.current.dialog.open).toBe(false);
    expect(vi.mocked(makePrint).mock.calls[0]![0]).toEqual({ pages: [0], marks: false });
    expect(vi.mocked(makePrint).mock.calls[0]![1]).toMatchObject({
      pictures: false,
      documentName: 'Lease',
    });
    expect(printInFrame).toHaveBeenCalledWith({ ok: true, way: 'pdf', bytes: Uint8Array.of(7) });
    expect(track).toHaveBeenCalledWith('Pdf', 'Exported', 'Print');
  });

  it('draws pictures where the browser shows no PDF, or the file allows a rough print only', async () => {
    vi.mocked(makePrint).mockResolvedValue({ ok: true, way: 'pictures', pictures: [] });
    Object.defineProperty(navigator, 'pdfViewerEnabled', { value: false, configurable: true });
    const { hook } = printing();
    await act(async () => hook.result.current.dialog.onPrint({ pages: null, marks: true }));
    expect(vi.mocked(makePrint).mock.calls[0]![1].pictures).toBe(true);
    Object.defineProperty(navigator, 'pdfViewerEnabled', { value: true, configurable: true });
    const rough = printing(source({ ...PdfPermissions.all(), printSharp: false }));
    await act(async () => rough.hook.result.current.dialog.onPrint({ pages: null, marks: true }));
    expect(vi.mocked(makePrint).mock.calls[1]![1].pictures).toBe(true);
  });

  it('says a print that cannot be made, or that failed outright, and hands the browser nothing', async () => {
    vi.mocked(makePrint).mockResolvedValueOnce({ ok: false, step: 'cut' });
    vi.mocked(makePrint).mockRejectedValueOnce(new Error('gone'));
    const { hook, onProblem } = printing();
    await act(async () => hook.result.current.dialog.onPrint({ pages: null, marks: true }));
    await act(async () => hook.result.current.dialog.onPrint({ pages: null, marks: true }));
    expect(onProblem.mock.calls).toEqual([[PRINT_FAILED_COPY], [PRINT_FAILED_COPY]]);
    expect(printInFrame).not.toHaveBeenCalled();
  });

  it('says a print the browser would not take', async () => {
    vi.mocked(makePrint).mockResolvedValue({ ok: true, way: 'pdf', bytes: Uint8Array.of(7) });
    vi.mocked(printInFrame).mockRejectedValueOnce(new Error('refused'));
    const { hook, onProblem } = printing();
    await act(async () => hook.result.current.dialog.onPrint({ pages: null, marks: true }));
    expect(onProblem).toHaveBeenCalledWith(PRINT_FAILED_COPY);
  });

  it('dims Print with the reason for a file that asks not to be printed, and ⌘P says it', () => {
    const { hook, onProblem } = printing(source({ ...PdfPermissions.all(), print: false }));
    expect(hook.result.current.actions[PRINT]).toMatchObject({
      disabled: true,
      label: PRINT_NOT_ALLOWED_LABEL,
    });
    act(() => {
      hook.result.current.onKey(key({ ctrlKey: false, metaKey: true }));
    });
    expect(onProblem).toHaveBeenCalledWith(PRINT_REFUSED_COPY);
    expect(hook.result.current.dialog.open).toBe(false);
  });

  it('leaves other keys, and a surface with no PDF open, alone', async () => {
    const { hook } = printing();
    for (const other of [
      key({ key: 'o' }),
      key({ shiftKey: true }),
      key({ altKey: true }),
      key({ ctrlKey: false }),
    ])
      expect(hook.result.current.onKey(other)).toBe(false);
    const none = printing(null);
    expect(none.hook.result.current.actions).toEqual({});
    expect(none.hook.result.current.onKey(key())).toBe(false);
    await act(async () => none.hook.result.current.dialog.onPrint({ pages: null, marks: true }));
    expect(makePrint).not.toHaveBeenCalled();
  });
});
