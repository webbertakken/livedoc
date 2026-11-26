// A Drawing's stroke as it is drawn, both ways (docs/specs/035-pdf-documents/live-editing-and-storage.md "A mark as it
// is made"): ours, put by the surface for the broadcaster; collaborators', kept by stroke until the finished mark takes
// their place.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINE_STYLES, PDF_DRAWING_MAX_POINTS, PDF_MAX_COORDINATE } from '@livedoc/pdf-documents';
import {
  PDF_DRAFT_COORDINATE_BOUND,
  PDF_DRAFT_LINE_STYLES,
  type PdfDraft,
} from '@livedoc/api-schema';
import {
  forgetPdfDrafts,
  getLocalPdfDraft,
  PDF_DRAFT_LINGER_MS,
  PDF_DRAFT_STALE_MS,
  pdfDraftsOf,
  receivePdfDraft,
  resetPdfDraftsForTests,
  setLocalPdfDraft,
  settlePdfDrafts,
  subscribePdfDrafts,
} from './pdf-draft-store';

const LOOK = { colour: '#e11d48', opacity: 1, width: 2 };

const stretch = (from: number, points: number[], stroke = 's1'): PdfDraft => ({
  tabId: 't',
  page: 'p:1',
  stroke,
  look: LOOK,
  from,
  points,
});
const end = (stroke = 's1'): PdfDraft => ({ tabId: 't', stroke, points: null });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  resetPdfDraftsForTests();
  vi.useRealTimers();
});

describe('the wire and the package agree', () => {
  it('names the Drawing\u2019s dashed line styles and a page\u2019s coordinate bound alike', () => {
    expect([...PDF_DRAFT_LINE_STYLES]).toEqual(LINE_STYLES.filter((style) => style !== 'solid'));
    expect(PDF_DRAFT_COORDINATE_BOUND).toBe(PDF_MAX_COORDINATE);
  });
});

describe('our stroke', () => {
  it('is put and taken back', () => {
    const ours = { tabId: 't', page: 'p:1', stroke: 's1', look: LOOK, points: [1, 2] };
    setLocalPdfDraft(ours);
    expect(getLocalPdfDraft()).toBe(ours);
    setLocalPdfDraft(null);
    expect(getLocalPdfDraft()).toBeNull();
  });
});

describe('collaborators\u2019 strokes', () => {
  it('begin at 0 and grow by what follows, by person and stroke, on their tab and page', () => {
    receivePdfDraft('ada', stretch(0, [1, 2, 3, 4]));
    receivePdfDraft('ada', stretch(2, [5, 6]));
    expect(pdfDraftsOf('t')).toEqual([
      { person: 'ada', stroke: 's1', page: 'p:1', look: LOOK, points: [1, 2, 3, 4, 5, 6] },
    ]);
    expect(pdfDraftsOf('other')).toEqual([]);
  });

  it('ignore a stretch that misses what came before, until a stroke begins at 0', () => {
    receivePdfDraft('ada', stretch(3, [5, 6]));
    expect(pdfDraftsOf('t')).toEqual([]);
    receivePdfDraft('ada', stretch(0, [1, 2]));
    receivePdfDraft('ada', stretch(4, [9, 9]));
    expect(pdfDraftsOf('t')).toEqual([]);
    receivePdfDraft('ada', stretch(1, [3, 4]));
    expect(pdfDraftsOf('t')).toEqual([]);
    receivePdfDraft('ada', stretch(0, [1, 2], 's2'));
    expect(pdfDraftsOf('t').map((draft) => draft.stroke)).toEqual(['s2']);
  });

  it('stay drawn after their end until the page\u2019s marks next change', () => {
    receivePdfDraft('ada', stretch(0, [1, 2]));
    receivePdfDraft('ada', end());
    expect(pdfDraftsOf('t')).toHaveLength(1);
    settlePdfDrafts('t');
    expect(pdfDraftsOf('t')).toEqual([]);
  });

  it('let a stroke still being drawn stay when the marks change', () => {
    receivePdfDraft('ada', stretch(0, [1, 2]));
    settlePdfDrafts('t');
    expect(pdfDraftsOf('t')).toHaveLength(1);
  });

  it('go PDF_DRAFT_LINGER_MS after their end, whatever the marks', () => {
    receivePdfDraft('ada', stretch(0, [1, 2]));
    receivePdfDraft('ada', end());
    vi.advanceTimersByTime(PDF_DRAFT_LINGER_MS - 1);
    expect(pdfDraftsOf('t')).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(pdfDraftsOf('t')).toEqual([]);
  });

  it('go once silent for PDF_DRAFT_STALE_MS: their drawer is gone', () => {
    receivePdfDraft('ada', stretch(0, [1, 2]));
    vi.advanceTimersByTime(PDF_DRAFT_STALE_MS - 10);
    receivePdfDraft('ada', stretch(1, [3, 4]));
    vi.advanceTimersByTime(PDF_DRAFT_STALE_MS - 1);
    expect(pdfDraftsOf('t')).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(pdfDraftsOf('t')).toEqual([]);
  });

  it('go with a person who leaves', () => {
    receivePdfDraft('ada', stretch(0, [1, 2]));
    receivePdfDraft('bo', stretch(0, [1, 2]));
    forgetPdfDrafts('ada');
    expect(pdfDraftsOf('t').map((draft) => draft.person)).toEqual(['bo']);
  });

  it('grow no further than PDF_DRAWING_MAX_POINTS', () => {
    const full = Array.from({ length: PDF_DRAWING_MAX_POINTS * 2 }, (_, at) => at % 100);
    receivePdfDraft('ada', stretch(0, full));
    receivePdfDraft('ada', stretch(PDF_DRAWING_MAX_POINTS, [1, 2]));
    expect(pdfDraftsOf('t')[0]!.points).toHaveLength(PDF_DRAWING_MAX_POINTS * 2);
  });

  it('ignore an end of a stroke never seen', () => {
    receivePdfDraft('ada', end('nope'));
    expect(pdfDraftsOf('t')).toEqual([]);
  });

  it('tell their listeners, and keep one list until something changes', () => {
    const heard = vi.fn();
    const stop = subscribePdfDrafts(heard);
    receivePdfDraft('ada', stretch(0, [1, 2]));
    expect(heard).toHaveBeenCalledTimes(1);
    expect(pdfDraftsOf('t')).toBe(pdfDraftsOf('t'));
    stop();
    receivePdfDraft('ada', stretch(1, [3, 4]));
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
