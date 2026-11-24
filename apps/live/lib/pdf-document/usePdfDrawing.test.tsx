// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Making a mark": A Drawing, each stroke one step of undo, joining the Drawing
// before it on its page; "Telemetry and observability"; "Limits": PDF_MAX_MARKS.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import {
  PageName,
  PDF_MAX_MARKS,
  PdfLiveChanges,
  type DrawingMark,
  type PageInfo,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { DRAWING_LOOK } from './pdf-drawing';
import { TOO_MANY_MARKS_COPY } from './pdf-surface-copy';
import { usePdfDrawing } from './usePdfDrawing';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const PAGES = [PageName.ofObject(3)].map((name) => ({ name }) as PageInfo);

function drawing(doc = PdfLiveChanges.load(), isOpen = true) {
  const steps: unknown[] = [];
  const onProblem = vi.fn();
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
  const hook = renderHook(() =>
    usePdfDrawing({ ready: isOpen ? ready : null, author: 'Ada', look: DRAWING_LOOK, onProblem }),
  );
  return { draw: hook.result.current, doc, steps, onProblem };
}

beforeEach(() => {
  vi.mocked(track).mockClear();
  vi.mocked(debugLog).mockClear();
});

describe('the Drawing tool’s strokes', () => {
  it('makes a Drawing of a stroke, and joins the next one to it, each a step of undo', () => {
    const { draw, doc, steps, onProblem } = drawing();
    act(() => draw(0, [10, 10, 20, 20]));
    act(() => draw(0, [30, 30]));
    const marks = PdfLiveChanges.marks(doc) as DrawingMark[];
    expect(marks).toHaveLength(1);
    expect(marks[0]!.strokes).toEqual([
      [10, 10, 20, 20],
      [30, 30],
    ]);
    expect(steps).toEqual([{ page: PAGES[0]!.name }, { page: PAGES[0]!.name }]);
    expect(debugLog).toHaveBeenCalledWith('[pdf] mark-added kind=drawing');
    expect(debugLog).toHaveBeenCalledWith('[pdf] drawing-joined strokes=2');
    expect(track).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith('Pdf', 'Added', 'Mark.Drawing');
    expect(onProblem).toHaveBeenLastCalledWith(null);
  });

  it('draws nothing before the PDF is open, on a page that is not there, or of no stroke', () => {
    const closed = drawing(undefined, false);
    act(() => closed.draw(0, [1, 1]));
    expect(PdfLiveChanges.isEmpty(closed.doc)).toBe(true);
    const open = drawing();
    act(() => open.draw(4, [1, 1]));
    act(() => open.draw(0, []));
    expect(PdfLiveChanges.isEmpty(open.doc)).toBe(true);
    expect(open.onProblem).not.toHaveBeenCalled();
  });

  it('says so when the PDF holds the most marks it may', () => {
    const doc = PdfLiveChanges.load();
    doc.transact(() => {
      const marks = doc.getMap('marks');
      for (let n = 0; n < PDF_MAX_MARKS; n += 1) marks.set(`m${n}`, 1);
    });
    const { draw, onProblem } = drawing(doc);
    act(() => draw(0, [1, 1]));
    expect(onProblem).toHaveBeenLastCalledWith(TOO_MANY_MARKS_COPY);
    expect(debugLog).toHaveBeenCalledWith('[pdf] limit-refused name=pdf_too_many_marks');
  });
});
