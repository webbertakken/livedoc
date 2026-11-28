// @vitest-environment jsdom
// docs/specs/034-text-documents/files-and-print.md "Printing": Print hands the browser the PDF Download as PDF writes,
// says each step while it is made, offers the PDF where the browser refuses the print; Print preview's bar.
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/telemetry';
import { downloadBlob } from '@/lib/download-blob';
import type { PdfMade, PdfStep } from './useTextDocumentPdf';
import {
  PRINT_BLOCKED_COPY,
  PRINT_FAILED_COPY,
  PRINT_ITEM,
  PRINT_PREVIEW_ITEM,
  TextDocumentPrintPreviewBar,
  useTextDocumentPrint,
  type PrintHand,
} from './useTextDocumentPrint';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/download-blob', () => ({ downloadBlob: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const BYTES = Uint8Array.of(37, 80, 68, 70);

const hand = (over: Partial<PrintHand> = {}): PrintHand => ({
  frame: vi.fn(async () => 'printed' as const),
  printsPdf: () => true,
  pictures: vi.fn(async () => ({ way: 'pictures' as const, pictures: [] })),
  ...over,
});

const made =
  (result: PdfMade, steps: PdfStep[] = ['laying-out', 'writing']) =>
  async (onStep: (step: PdfStep) => void) => {
    for (const step of steps) onStep(step);
    return result;
  };

function setUp(make: Parameters<typeof useTextDocumentPrint>[0]['make'], printHand: PrintHand) {
  const setPrinting = vi.fn();
  const hook = renderHook(() =>
    useTextDocumentPrint({ make, printing: null, setPrinting, name: 'Plan', hand: printHand }),
  );
  const view = render(<>{hook.result.current.dialog}</>);
  const rerender = () => view.rerender(<>{hook.result.current.dialog}</>);
  return { hook, setPrinting, rerender };
}

describe('useTextDocumentPrint', () => {
  it('hands the browser the written PDF, and counts the print', async () => {
    const printHand = hand();
    const { hook } = setUp(made({ ok: true, bytes: BYTES }), printHand);
    await act(async () => hook.result.current.actions[PRINT_ITEM]!.run());
    expect(printHand.frame).toHaveBeenCalledWith({ way: 'pdf', bytes: BYTES });
    expect(track).toHaveBeenCalledWith('UI', 'Used', 'TextDocumentPrint');
  });

  it('hands pictures of the pages where the browser cannot print a PDF', async () => {
    const printHand = hand({ printsPdf: () => false });
    const { hook } = setUp(made({ ok: true, bytes: BYTES }), printHand);
    await act(async () => hook.result.current.actions[PRINT_ITEM]!.run());
    expect(printHand.pictures).toHaveBeenCalledWith(BYTES);
    expect(printHand.frame).toHaveBeenCalledWith({ way: 'pictures', pictures: [] });
  });

  it('says the print could not be made where the pictures could not be drawn', async () => {
    const printHand = hand({ printsPdf: () => false, pictures: vi.fn(async () => null) });
    const { hook, rerender } = setUp(made({ ok: true, bytes: BYTES }), printHand);
    await act(async () => hook.result.current.actions[PRINT_ITEM]!.run());
    rerender();
    expect(screen.getByRole('status').textContent).toBe(PRINT_FAILED_COPY);
    expect(printHand.frame).not.toHaveBeenCalled();
  });

  it('says plainly when the browser blocks the print, and offers the PDF', async () => {
    const printHand = hand({ frame: vi.fn(async () => 'blocked' as const) });
    const { hook, rerender } = setUp(made({ ok: true, bytes: BYTES }), printHand);
    await act(async () => hook.result.current.actions[PRINT_ITEM]!.run());
    rerender();
    expect(screen.getByRole('status').textContent).toBe(PRINT_BLOCKED_COPY);
    expect(track).not.toHaveBeenCalledWith('UI', 'Used', 'TextDocumentPrint');
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Plan.pdf');
  });

  it('says a print that could not be made, and hands the browser nothing', async () => {
    const printHand = hand();
    const { hook, rerender } = setUp(made({ ok: false, cancelled: false }), printHand);
    await act(async () => hook.result.current.actions[PRINT_ITEM]!.run());
    rerender();
    expect(screen.getByRole('status').textContent).toBe(PRINT_FAILED_COPY);
    expect(printHand.frame).not.toHaveBeenCalled();
  });

  it('shows each step while the PDF is made, and stops when the dialog is closed', async () => {
    const printHand = hand();
    let release: (made: PdfMade) => void = () => {};
    let cancelled: () => boolean = () => false;
    const make = (onStep: (step: PdfStep) => void, isCancelled: () => boolean) => {
      onStep('reading');
      cancelled = isCancelled;
      return new Promise<PdfMade>((done) => (release = done));
    };
    const { hook, rerender } = setUp(make, printHand);
    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = Promise.resolve(hook.result.current.actions[PRINT_ITEM]!.run());
    });
    rerender();
    expect(screen.getByRole('status').textContent).toBe('Reading the pages…');
    // A second Print while one is made does nothing.
    act(() => void hook.result.current.actions[PRINT_ITEM]!.run());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(cancelled()).toBe(true);
    await act(async () => {
      release({ ok: true, bytes: BYTES });
      await running;
    });
    expect(printHand.frame).not.toHaveBeenCalled();
  });

  it('opens Print preview in the printing look, and counts it', () => {
    const { hook, setPrinting } = setUp(made({ ok: true, bytes: BYTES }), hand());
    act(() => void hook.result.current.actions[PRINT_PREVIEW_ITEM]!.run());
    expect(setPrinting).toHaveBeenCalledWith('preview');
    expect(track).toHaveBeenCalledWith('UI', 'Used', 'TextDocumentPrintPreview');
  });

  it('draws the bar only in Print preview, and Close leaves it', () => {
    const setPrinting = vi.fn();
    const { result, rerender } = renderHook(
      ({ printing }) =>
        useTextDocumentPrint({
          make: made({ ok: true, bytes: BYTES }),
          printing,
          setPrinting,
          name: 'Plan',
          hand: hand(),
        }),
      { initialProps: { printing: null as 'preview' | null } },
    );
    expect(result.current.bar).toBeNull();
    rerender({ printing: 'preview' });
    render(<>{result.current.bar}</>);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(setPrinting).toHaveBeenCalledWith(null);
  });
});

describe('TextDocumentPrintPreviewBar', () => {
  it('starts on Print; Escape closes and ⌘P prints', () => {
    const onPrint = vi.fn();
    const onClose = vi.fn();
    render(<TextDocumentPrintPreviewBar onPrint={onPrint} onClose={onClose} />);
    expect(screen.getByRole('toolbar', { name: 'Print preview' })).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Print' }));
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });
    expect(onPrint).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'a' });
    expect(onPrint).toHaveBeenCalledTimes(1);
  });
});
