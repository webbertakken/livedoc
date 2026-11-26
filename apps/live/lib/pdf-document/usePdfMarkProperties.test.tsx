// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Changing a mark": Properties opens from Format > Properties in Reviewing,
// follows the selection, changes a subject as one step on its page, makes a look the default; Find's results taking the
// right close it; "Telemetry and observability".
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mark, PageName, PdfLiveChanges, type PageInfo } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { pdfChangeableStore } from './pdf-changeable-marks';
import { markLooks, resetMarkLooks } from './pdf-mark-looks';
import { pdfMarksStore } from './pdf-marks-store';
import { MARK_PROPERTIES } from './pdf-menus';
import type { PdfMarksChosen } from './usePdfMarkSelection';
import { usePdfMarkProperties } from './usePdfMarkProperties';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const PAGES = [PageName.ofObject(3)].map((name) => ({ name, width: 612, height: 792 }) as PageInfo);
const BASE = { page: PAGES[0]!.name, opacity: 1, author: 'Ada', createdAt: 1, colour: '#123456' };

function properties({ marking = true } = {}) {
  const doc = PdfLiveChanges.load();
  PdfLiveChanges.addMark(
    doc,
    Mark.shape('ellipse', { ...BASE, id: 'e', rect: [0, 0, 9, 9], width: 3 })!,
  );
  PdfLiveChanges.addMark(
    doc,
    Mark.stamp({ ...BASE, id: 's', stamp: 'approved', rect: [0, 0, 90, 30], lines: ['APPROVED'] })!,
  );
  const steps: unknown[] = [];
  const onOpen = vi.fn();
  const ready = {
    pages: PAGES,
    binding: { doc } as never,
    undo: {
      step: <Made,>(place: unknown, made: () => Made) => {
        steps.push(place);
        return made();
      },
    } as never,
  };
  const marks = pdfChangeableStore(doc, pdfMarksStore(doc));
  const hook = renderHook(
    ({ chosen, covered }: { chosen: PdfMarksChosen | null; covered: boolean }) =>
      usePdfMarkProperties({ ready, marks, marking, chosen, covered, onOpen }),
    { initialProps: { chosen: { page: 0, ids: ['e'] }, covered: false } },
  );
  const run = () => act(() => hook.result.current.actions[MARK_PROPERTIES]!.run());
  return { hook, doc, steps, onOpen, run };
}

beforeEach(() => {
  vi.mocked(track).mockClear();
  vi.mocked(debugLog).mockClear();
});
afterEach(() => {
  localStorage.clear();
  resetMarkLooks();
});

describe('a mark’s Properties', () => {
  it('opens from Format > Properties, giving the right to it, and shows the one mark selected', () => {
    const { hook, onOpen, run } = properties();
    expect(hook.result.current.open).toBe(false);
    run();
    expect(hook.result.current).toMatchObject({ open: true, focusNonce: 1 });
    expect(hook.result.current.actions[MARK_PROPERTIES]!.checked).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'PdfDocumentPanelProperties');
    expect(hook.result.current.mark?.id).toBe('e');
    hook.rerender({ chosen: { page: 0, ids: ['e', 's'] }, covered: false });
    expect(hook.result.current.mark).toBeNull();
    run();
    expect(hook.result.current.open).toBe(false);
  });

  it('changes the subject as one step on its page, logged and counted', () => {
    const { hook, doc, steps } = properties();
    act(() => hook.result.current.setSubject('Round this'));
    expect(PdfLiveChanges.mark(doc, 'e')?.subject).toBe('Round this');
    expect(steps).toEqual([{ page: PAGES[0]!.name }]);
    expect(debugLog).toHaveBeenCalledWith('[pdf] mark-subject kind=ellipse cleared=false');
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'Mark.Subject');
    vi.mocked(track).mockClear();
    act(() => hook.result.current.setSubject('Round this'));
    expect(track).not.toHaveBeenCalled();
  });

  it('makes the mark’s look its tool’s, for every kind but a stamp', () => {
    const { hook } = properties();
    act(() => hook.result.current.makeDefault!());
    expect(markLooks().ellipse).toMatchObject({ colour: '#123456', width: 3 });
    expect(debugLog).toHaveBeenCalledWith('[pdf] look-defaulted kind=ellipse');
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'LookDefault.Ellipse');
    hook.rerender({ chosen: { page: 0, ids: ['s'] }, covered: false });
    expect(hook.result.current.makeDefault).toBeNull();
  });

  it('closes when Find’s results take the right, and stays closed once they go', () => {
    const { hook, run } = properties();
    run();
    hook.rerender({ chosen: { page: 0, ids: ['e'] }, covered: true });
    expect(hook.result.current.open).toBe(false);
    hook.rerender({ chosen: { page: 0, ids: ['e'] }, covered: false });
    expect(hook.result.current.open).toBe(false);
  });

  it('is not offered outside Reviewing', () => {
    const { hook } = properties({ marking: false });
    expect(hook.result.current.actions).toEqual({});
    expect(hook.result.current.open).toBe(false);
  });
});
