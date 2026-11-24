// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Making a mark": a line or shape let go is one step of undo, in its kind's
// look; a press makes nothing; "Telemetry and observability"; "Limits": PDF_MAX_MARKS.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import { PageName, PDF_MAX_MARKS, PdfLiveChanges, type PageInfo } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { FIRST_LOOKS } from './pdf-mark-looks';
import { TOO_MANY_MARKS_COPY } from './pdf-surface-copy';
import { usePdfShapes } from './usePdfShapes';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const PAGES = [PageName.ofObject(3)].map((name) => ({ name }) as PageInfo);
const LOOKS = { ...FIRST_LOOKS, ellipse: { colour: '#1a73e8', opacity: 1 } };

function shaping(doc = PdfLiveChanges.load(), isOpen = true) {
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
    usePdfShapes({ ready: isOpen ? ready : null, author: 'Ada', looks: LOOKS, onProblem }),
  );
  return { shape: hook.result.current, doc, steps, onProblem };
}

beforeEach(() => {
  vi.mocked(track).mockClear();
  vi.mocked(debugLog).mockClear();
});

describe('the shape tools’ marks', () => {
  it('makes a shape in its kind’s look, a step of undo, logged and counted', () => {
    const { shape, doc, steps, onProblem } = shaping();
    act(() => shape(0, { kind: 'ellipse', rect: [10, 10, 60, 40], width: 2 }));
    expect(PdfLiveChanges.marks(doc)).toEqual([
      expect.objectContaining({ kind: 'ellipse', colour: '#1a73e8', author: 'Ada' }),
    ]);
    expect(steps).toEqual([{ page: PAGES[0]!.name }]);
    expect(debugLog).toHaveBeenCalledWith('[pdf] mark-added kind=ellipse');
    expect(track).toHaveBeenCalledWith('Pdf', 'Added', 'Mark.Ellipse');
    expect(onProblem).toHaveBeenLastCalledWith(null);
  });

  it('makes nothing before the PDF is open, on a page that is not there, or of a press', () => {
    const closed = shaping(undefined, false);
    act(() => closed.shape(0, { kind: 'line', line: [1, 1, 50, 50], width: 2 }));
    expect(PdfLiveChanges.isEmpty(closed.doc)).toBe(true);
    const open = shaping();
    act(() => open.shape(4, { kind: 'line', line: [1, 1, 50, 50], width: 2 }));
    act(() => open.shape(0, null));
    expect(PdfLiveChanges.isEmpty(open.doc)).toBe(true);
    expect(open.onProblem).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledWith('[pdf] mark-refused name=no_shape');
  });

  it('says so when the PDF holds the most marks it may', () => {
    const doc = PdfLiveChanges.load();
    doc.transact(() => {
      const marks = doc.getMap('marks');
      for (let n = 0; n < PDF_MAX_MARKS; n += 1) marks.set(`m${n}`, 1);
    });
    const { shape, onProblem } = shaping(doc);
    act(() => shape(0, { kind: 'arrow', line: [1, 1, 50, 50], width: 2 }));
    expect(onProblem).toHaveBeenLastCalledWith(TOO_MANY_MARKS_COPY);
    expect(debugLog).toHaveBeenCalledWith('[pdf] limit-refused name=pdf_too_many_marks');
  });
});
