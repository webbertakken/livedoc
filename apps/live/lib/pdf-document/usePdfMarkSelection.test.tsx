// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Changing a mark": a press selects a mark, ⇧ adds to the selection or takes a
// selected mark out, a selection holds one page's marks, selecting a mark lets a text selection go and text selected
// lets the marks go; a move and a deletion are each one step of undo; Edit > Delete; "Telemetry and observability".
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import { Mark, PageName, PdfLiveChanges, type PageInfo } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { pdfMarksStore } from './pdf-marks-store';
import { DELETE_MARKS } from './pdf-menus';
import type { PdfTextSelected } from './usePdfTextSelection';
import { usePdfMarkSelection } from './usePdfMarkSelection';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const PAGES = [PageName.ofObject(3), PageName.ofObject(4)].map((name) => ({ name }) as PageInfo);
const T = 1_795_000_000_000;
const BASE = { colour: '#ff0000', opacity: 1, author: 'Ada', createdAt: T };

const line = (id: string, page = PAGES[0]!.name) =>
  Mark.line('arrow', { ...BASE, page, id, line: [10, 10, 50, 60], width: 2 })!;

function selecting({ marking = true, open = true } = {}) {
  const doc = PdfLiveChanges.load();
  for (const mark of [line('a'), line('b'), line('c', PAGES[1]!.name)])
    PdfLiveChanges.addMark(doc, mark);
  const steps: unknown[] = [];
  const focusPages = vi.fn();
  const clearText = vi.fn();
  const ready = {
    pages: PAGES,
    storedFile: 'ab'.repeat(32) as BlobKey,
    binding: { doc } as never,
    undo: {
      step: <Made,>(place: unknown, made: () => Made) => {
        steps.push(place);
        return made();
      },
    } as never,
  };
  const marks = pdfMarksStore(doc);
  const hook = renderHook(
    ({ text }: { text: PdfTextSelected | null }) =>
      usePdfMarkSelection({
        ready: open ? ready : null,
        marks: open ? marks : null,
        marking,
        textSelected: text,
        clearText,
        focusPages,
      }),
    { initialProps: { text: null as PdfTextSelected | null } },
  );
  return { hook, doc, steps, focusPages, clearText };
}

beforeEach(() => {
  vi.mocked(track).mockClear();
  vi.mocked(debugLog).mockClear();
});

describe('selecting marks', () => {
  it('selects the mark pressed, alone, and lets a text selection go', () => {
    const { hook, clearText } = selecting();
    act(() => hook.result.current.choosing!.choose(0, 'a', false));
    expect(hook.result.current.chosen).toEqual({ page: 0, ids: ['a'] });
    act(() => hook.result.current.choosing!.choose(0, 'b', false));
    expect(hook.result.current.chosen).toEqual({ page: 0, ids: ['b'] });
    expect(clearText).toHaveBeenCalled();
  });

  it('adds with ⇧, takes a selected mark out with ⇧, and keeps the selection for a press on one of it', () => {
    const { hook } = selecting();
    act(() => hook.result.current.choosing!.choose(0, 'a', false));
    act(() => hook.result.current.choosing!.choose(0, 'b', true));
    expect(hook.result.current.chosen).toEqual({ page: 0, ids: ['a', 'b'] });
    act(() => hook.result.current.choosing!.choose(0, 'a', false));
    expect(hook.result.current.chosen).toEqual({ page: 0, ids: ['a', 'b'] });
    act(() => hook.result.current.choosing!.choose(0, 'a', true));
    expect(hook.result.current.chosen).toEqual({ page: 0, ids: ['b'] });
    act(() => hook.result.current.choosing!.choose(0, 'b', true));
    expect(hook.result.current.chosen).toBeNull();
  });

  it('holds one page’s marks: a press on another page’s starts a new selection', () => {
    const { hook } = selecting();
    act(() => hook.result.current.choosing!.choose(0, 'a', false));
    act(() => hook.result.current.choosing!.choose(1, 'c', true));
    expect(hook.result.current.chosen).toEqual({ page: 1, ids: ['c'] });
  });

  it('lets the marks go on a press on nothing, on Escape, and once text is selected', () => {
    const { hook, focusPages } = selecting();
    act(() => hook.result.current.choosing!.choose(0, 'a', false));
    act(() => hook.result.current.choosing!.letGo());
    expect(hook.result.current.chosen).toBeNull();
    act(() => hook.result.current.choosing!.choose(0, 'a', false));
    act(() => hook.result.current.choosing!.leave());
    expect(hook.result.current.chosen).toBeNull();
    expect(focusPages).toHaveBeenCalled();
    act(() => hook.result.current.choosing!.choose(0, 'a', false));
    hook.rerender({ text: { page: 0, spans: [], quads: [], text: 'x', touch: false } });
    expect(hook.result.current.chosen).toBeNull();
  });

  it('forgets a mark that is gone, keeping the rest', () => {
    const { hook, doc } = selecting();
    act(() => hook.result.current.choosing!.choose(0, 'a', false));
    act(() => hook.result.current.choosing!.choose(0, 'b', true));
    act(() => PdfLiveChanges.removeMark(doc, 'a'));
    expect(hook.result.current.chosen).toEqual({ page: 0, ids: ['b'] });
    act(() => PdfLiveChanges.removeMark(doc, 'b'));
    expect(hook.result.current.chosen).toBeNull();
  });

  it('keeps the marks when a text selection goes', () => {
    const { hook } = selecting();
    hook.rerender({ text: { page: 0, spans: [], quads: [], text: 'x', touch: false } });
    act(() => hook.result.current.choosing!.choose(0, 'a', false));
    hook.rerender({ text: null });
    expect(hook.result.current.chosen).toEqual({ page: 0, ids: ['a'] });
  });

  it('offers nothing to choose with, and no Delete, while marks may not be changed', () => {
    expect(selecting({ marking: false }).hook.result.current.choosing).toBeNull();
    expect(selecting({ open: false }).hook.result.current.choosing).toBeNull();
    expect(selecting({ marking: false }).hook.result.current.actions).toEqual({});
  });
});

describe('moving and deleting the selected marks', () => {
  it('moves the selection as one step of undo, logged and counted', () => {
    const { hook, doc, steps } = selecting();
    act(() => hook.result.current.choosing!.choose(0, 'a', false));
    act(() => hook.result.current.choosing!.choose(0, 'b', true));
    act(() => hook.result.current.choosing!.move(0, { x: 5, y: 5 }));
    expect(PdfLiveChanges.mark(doc, 'a')).toMatchObject({ line: [15, 15, 55, 65] });
    expect(PdfLiveChanges.mark(doc, 'b')).toMatchObject({ line: [15, 15, 55, 65] });
    expect(steps).toEqual([{ page: PAGES[0]!.name }]);
    expect(debugLog).toHaveBeenCalledWith('[pdf] marks-moved count=2');
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'Mark.Moved');
  });

  it('moves nothing, and counts nothing, for no offset or another page', () => {
    const { hook, steps } = selecting();
    act(() => hook.result.current.choosing!.move(0, { x: 5, y: 5 }));
    act(() => hook.result.current.choosing!.choose(0, 'a', false));
    act(() => hook.result.current.choosing!.move(1, { x: 5, y: 5 }));
    act(() => hook.result.current.choosing!.move(0, { x: 0, y: 0 }));
    expect(steps).toEqual([{ page: PAGES[0]!.name }]);
    expect(track).not.toHaveBeenCalled();
  });

  it('deletes the selection as one step from Edit > Delete, each mark counted by kind', () => {
    const { hook, doc, steps, focusPages } = selecting();
    expect(hook.result.current.actions[DELETE_MARKS]).toMatchObject({ disabled: true });
    act(() => hook.result.current.choosing!.choose(0, 'a', false));
    act(() => hook.result.current.choosing!.choose(0, 'b', true));
    expect(hook.result.current.actions[DELETE_MARKS]).toMatchObject({ disabled: false });
    act(() => hook.result.current.actions[DELETE_MARKS]!.run());
    expect(PdfLiveChanges.marks(doc).map((mark) => mark.id)).toEqual(['c']);
    expect(steps).toEqual([{ page: PAGES[0]!.name }]);
    expect(hook.result.current.chosen).toBeNull();
    expect(focusPages).toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledWith('[pdf] marks-deleted count=2');
    expect(vi.mocked(track).mock.calls).toEqual([
      ['Pdf', 'Deleted', 'Mark.Arrow'],
      ['Pdf', 'Deleted', 'Mark.Arrow'],
    ]);
  });

  // marks.md "Changing a mark": a resize is one step of undo; "Telemetry and observability": Mark.Resized.
  it('resizes a mark as one step of undo, logged and counted', () => {
    const { hook, doc, steps } = selecting();
    act(() => hook.result.current.choosing!.reshape(0, 'a', { line: [0, 0, 9, 9] }));
    expect(PdfLiveChanges.mark(doc, 'a')).toMatchObject({ line: [0, 0, 9, 9] });
    expect(steps).toEqual([{ page: PAGES[0]!.name }]);
    expect(debugLog).toHaveBeenCalledWith('[pdf] mark-resized kind=arrow');
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'Mark.Resized');
  });

  it('resizes nothing that is gone, or on a page that is not there', () => {
    const { hook, steps } = selecting();
    act(() => hook.result.current.choosing!.reshape(0, 'gone', { line: [0, 0, 9, 9] }));
    act(() => hook.result.current.choosing!.reshape(7, 'a', { line: [0, 0, 9, 9] }));
    expect(steps).toEqual([{ page: PAGES[0]!.name }]);
    expect(track).not.toHaveBeenCalled();
  });

  it('deletes nothing with nothing selected', () => {
    const { hook, steps } = selecting();
    act(() => hook.result.current.choosing!.remove());
    expect(steps).toEqual([]);
    expect(debugLog).not.toHaveBeenCalled();
  });
});
