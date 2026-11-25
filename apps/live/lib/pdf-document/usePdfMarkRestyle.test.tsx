// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Changing a mark": the toolbar's Colour is the selected marks', blank where
// they differ, Reset gives each its first look; Format > Opacity and Line width, checked where every mark they reach
// holds the step, dimmed while none has what they set; each restyle one step of undo, then the pages have the keys;
// "Telemetry and observability": `Mark.Restyled`, `[pdf] marks-restyled`.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Mark, PageName, PdfLiveChanges, type PageInfo, type Quad } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { FIRST_LOOKS } from './pdf-mark-looks';
import { pdfMarksStore } from './pdf-marks-store';
import { FILL_COLOUR, TOOL_COLOUR } from './pdf-toolbar';
import type { PdfMarksChosen } from './usePdfMarkSelection';
import { usePdfMarkRestyle } from './usePdfMarkRestyle';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const PAGES = [PageName.ofObject(3), PageName.ofObject(4)].map((name) => ({ name }) as PageInfo);
const T = 1_795_000_000_000;
const BASE = { page: PAGES[0]!.name, opacity: 1, author: 'Ada', createdAt: T };
const QUAD: Quad = [100, 716, 200, 716, 100, 700, 200, 700];

const BOTH: PdfMarksChosen = { page: 0, ids: ['a', 'h'] };

function restyling({
  chosen = BOTH,
  marking = true,
  open = true,
}: { chosen?: PdfMarksChosen | null; marking?: boolean; open?: boolean } = {}) {
  const doc = PdfLiveChanges.load();
  PdfLiveChanges.addMark(
    doc,
    Mark.line('arrow', { ...BASE, colour: '#ff0000', id: 'a', line: [10, 10, 50, 60], width: 2 })!,
  );
  PdfLiveChanges.addMark(
    doc,
    Mark.highlight({ ...BASE, colour: '#ff0000', id: 'h', quads: [QUAD], text: 'x' })!,
  );
  PdfLiveChanges.addMark(
    doc,
    Mark.shape('rectangle', {
      ...BASE,
      colour: '#ff0000',
      id: 'r',
      rect: [10, 10, 50, 60],
      width: 2,
    })!,
  );
  const steps: unknown[] = [];
  const focusPages = vi.fn();
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
  const marks = pdfMarksStore(doc);
  const hook = renderHook(
    ({ held }: { held: PdfMarksChosen | null }) =>
      usePdfMarkRestyle({
        ready: open ? ready : null,
        marks: open ? marks : null,
        marking,
        chosen: held,
        focusPages,
      }),
    { initialProps: { held: chosen } },
  );
  return { hook, doc, steps, focusPages };
}

beforeEach(() => {
  vi.mocked(track).mockClear();
  vi.mocked(debugLog).mockClear();
});

describe('the selected marks’ colour', () => {
  it('reads the colour they share, and gives every one a colour picked, as one step', () => {
    const { hook, doc, steps, focusPages } = restyling();
    const colour = hook.result.current.colours[TOOL_COLOUR]!;
    expect(colour.read()).toBe('#ff0000');
    expect(colour.leading).toBe('Reset');
    act(() => colour.set('#00aa00'));
    expect(PdfLiveChanges.mark(doc, 'a')).toMatchObject({ colour: '#00aa00' });
    expect(PdfLiveChanges.mark(doc, 'h')).toMatchObject({ colour: '#00aa00' });
    expect(steps).toEqual([{ page: PAGES[0]!.name }]);
    expect(debugLog).toHaveBeenCalledWith('[pdf] marks-restyled count=2 look=colour');
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'Mark.Restyled');
    expect(focusPages).toHaveBeenCalled();
    expect(hook.result.current.colours[TOOL_COLOUR]!.read()).toBe('#00aa00');
  });

  it('is blank where they differ, and Reset gives each its kind’s first look', () => {
    const { hook, doc } = restyling();
    act(() => hook.result.current.colours[TOOL_COLOUR]!.set(null));
    expect(PdfLiveChanges.mark(doc, 'a')).toMatchObject({ colour: FIRST_LOOKS.arrow.colour });
    expect(PdfLiveChanges.mark(doc, 'h')).toMatchObject({ colour: FIRST_LOOKS.highlight.colour });
    expect(hook.result.current.colours[TOOL_COLOUR]!.read()).toBeNull();
  });

  it('counts nothing where nothing changes, yet gives the pages the keys', () => {
    const { hook, steps, focusPages } = restyling();
    act(() => hook.result.current.colours[TOOL_COLOUR]!.set('#ff0000'));
    expect(steps).toHaveLength(1);
    expect(debugLog).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(focusPages).toHaveBeenCalled();
  });

  it('is no control while no mark is selected', () => {
    expect(restyling({ chosen: null }).hook.result.current.colours).toEqual({});
  });
});

describe('Format > Opacity and Line width', () => {
  it('gives every selected mark an opacity, checked where they all hold it', () => {
    const { hook, doc } = restyling();
    expect(hook.result.current.actions['opacity-100']).toMatchObject({
      checked: true,
      disabled: false,
    });
    act(() => hook.result.current.actions['opacity-50']!.run());
    expect(PdfLiveChanges.mark(doc, 'h')).toMatchObject({ opacity: 0.5 });
    expect(debugLog).toHaveBeenCalledWith('[pdf] marks-restyled count=2 look=opacity');
    expect(hook.result.current.actions['opacity-50']!.checked).toBe(true);
    expect(hook.result.current.actions['opacity-100']!.checked).toBe(false);
  });

  it('gives a width to the marks with a line alone, checked as they hold it', () => {
    const { hook, doc } = restyling();
    expect(hook.result.current.actions['line-width-2-pt']).toMatchObject({
      checked: true,
      disabled: false,
    });
    act(() => hook.result.current.actions['line-width-8-pt']!.run());
    expect(PdfLiveChanges.mark(doc, 'a')).toMatchObject({ width: 8 });
    expect(debugLog).toHaveBeenCalledWith('[pdf] marks-restyled count=1 look=width');
    expect(hook.result.current.actions['line-width-8-pt']!.checked).toBe(true);
  });

  it('dims Line width while no selected mark has a line, and both with nothing selected', () => {
    const highlightOnly = restyling({ chosen: { page: 0, ids: ['h'] } }).hook.result.current;
    expect(highlightOnly.actions['line-width-1-pt']).toMatchObject({
      disabled: true,
      checked: false,
    });
    expect(highlightOnly.actions['opacity-100']!.disabled).toBe(false);
    const none = restyling({ chosen: null }).hook.result.current;
    expect(none.actions['opacity-100']).toMatchObject({ disabled: true, checked: false });
    act(() => none.actions['opacity-50']!.run());
    expect(track).not.toHaveBeenCalled();
  });

  it('binds nothing outside Reviewing or before the PDF is open', () => {
    expect(restyling({ marking: false }).hook.result.current).toEqual({ colours: {}, actions: {} });
    expect(restyling({ open: false }).hook.result.current).toEqual({ colours: {}, actions: {} });
  });
});

// marks.md "Changing a mark": Format > Line style; the toolbar's Fill, the selected Rectangles' and Ellipses', led by
// None.
describe('Format > Line style and the Fill control', () => {
  it('gives the marks with a line a style, checked as they hold it, dimmed while none has a line', () => {
    const { hook, doc } = restyling();
    expect(hook.result.current.actions['line-style-solid']).toMatchObject({
      checked: true,
      disabled: false,
    });
    act(() => hook.result.current.actions['line-style-dotted']!.run());
    expect(PdfLiveChanges.mark(doc, 'a')).toMatchObject({ lineStyle: 'dotted' });
    expect(debugLog).toHaveBeenCalledWith('[pdf] marks-restyled count=1 look=style');
    expect(hook.result.current.actions['line-style-dotted']!.checked).toBe(true);
    const highlightOnly = restyling({ chosen: { page: 0, ids: ['h'] } }).hook.result.current;
    expect(highlightOnly.actions['line-style-dashed']!.disabled).toBe(true);
  });

  it('offers Fill only while a Rectangle or an Ellipse is selected, None where it has none', () => {
    expect(restyling().hook.result.current.colours[FILL_COLOUR]).toBeUndefined();
    const { hook, doc } = restyling({ chosen: { page: 0, ids: ['r', 'a'] } });
    const fill = hook.result.current.colours[FILL_COLOUR]!;
    expect(fill.leading).toBe('None');
    expect(fill.read()).toBeUndefined();
    act(() => fill.set('#1a73e8'));
    expect(PdfLiveChanges.mark(doc, 'r')).toMatchObject({ fill: '#1a73e8' });
    expect(debugLog).toHaveBeenCalledWith('[pdf] marks-restyled count=1 look=fill');
    expect(hook.result.current.colours[FILL_COLOUR]!.read()).toBe('#1a73e8');
    act(() => hook.result.current.colours[FILL_COLOUR]!.set(null));
    expect(PdfLiveChanges.mark(doc, 'r')).not.toHaveProperty('fill');
  });

  it('reads Fill blank where the shapes selected differ', () => {
    const { hook, doc } = restyling({ chosen: { page: 0, ids: ['r', 'e'] } });
    act(() => {
      PdfLiveChanges.addMark(
        doc,
        Mark.parse({
          ...BASE,
          kind: 'ellipse',
          colour: '#ff0000',
          id: 'e',
          rect: [10, 10, 50, 60],
          width: 2,
          fill: '#1a73e8',
          modifiedAt: T,
        })!,
      );
    });
    expect(hook.result.current.colours[FILL_COLOUR]!.read()).toBeNull();
  });
});

// marks.md "Changing a mark": Format > Line ends, checked as the Lines and Arrows hold it, dimmed while none is selected.
describe('Format > Line ends', () => {
  it('gives the Arrow its end, checked as it holds it', () => {
    const { hook, doc } = restyling();
    expect(hook.result.current.actions['line-ends-open-arrow']).toMatchObject({
      checked: true,
      disabled: false,
    });
    act(() => hook.result.current.actions['line-ends-circle']!.run());
    expect(PdfLiveChanges.mark(doc, 'a')).toMatchObject({ lineEnd: 'circle' });
    expect(debugLog).toHaveBeenCalledWith('[pdf] marks-restyled count=1 look=end');
    expect(hook.result.current.actions['line-ends-circle']!.checked).toBe(true);
  });

  it('dims every end while no Line or Arrow is selected', () => {
    const actions = restyling({ chosen: { page: 0, ids: ['h', 'r'] } }).hook.result.current.actions;
    expect(actions['line-ends-none']).toMatchObject({ disabled: true, checked: false });
  });
});
