// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Making a mark", "Telemetry and observability"; reading-surface.md "The
// toolbar"; keyboard-shortcuts.md "Tools": the text tools, the Highlight control and its chevron, the selection's
// mark items, the tools' keys, and a mark made as one step of the person's undo.
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import {
  Mark,
  PageName,
  PDF_MAX_MARKS,
  PdfLiveChanges,
  type PageInfo,
  type Quad,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import {
  HIGHLIGHT_SELECTION,
  STRIKETHROUGH_SELECTION,
  UNDERLINE_SELECTION,
} from './pdf-context-menu';
import {
  TOOL_ARROW,
  TOOL_CALLOUT,
  TOOL_DRAWING,
  TOOL_ERASE,
  TOOL_ELLIPSE,
  TOOL_POLYGON,
  TOOL_CLOUD,
  TOOL_CONNECTED_LINES,
  TOOL_HIGHLIGHT,
  TOOL_LINE,
  TOOL_RECTANGLE,
  TOOL_SELECT,
  TOOL_SQUIGGLY,
  TOOL_STRIKETHROUGH,
  TOOL_TEXT,
  TOOL_UNDERLINE,
} from './pdf-menus';
import { TOO_MANY_MARKS_COPY } from './pdf-surface-copy';
import { TEXT_MARK_LOOKS } from './pdf-text-mark';
import { resetTextMarkPick, textMarkPick } from './pdf-text-mark-pick';
import { DRAWING_LOOK, DRAWING_WIDTH_PT } from './pdf-drawing';
import { resetMarkLooks } from './pdf-mark-looks';
import { SHAPE_LOOK, SHAPE_WIDTH_PT } from './pdf-shape';
import { resetShapePick, shapePick } from './pdf-shape-pick';
import { resetStampPick } from './pdf-stamp-pick';
import { DRAWING_TOOLS } from './pdf-toolbar';
import { drawingPick, resetDrawingPick } from './pdf-drawing-pick';
import {
  FILL_COLOUR,
  SHAPE_TOOLS,
  STAMP_TOOLS,
  TEXT_MARK_TOOLS,
  TOOL_COLOUR,
  TYPED_TOOLS,
} from './pdf-toolbar';
import { TYPED_LOOK, TYPED_SIZE_PT } from './pdf-typed';
import { resetTypedPick } from './pdf-typed-pick';
import { usePdfMarkTools } from './usePdfMarkTools';
import type { PdfTextSelected } from './usePdfTextSelection';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const QUAD: Quad = [72, 730, 300, 730, 72, 716, 300, 716];
const PAGES = [PageName.ofObject(3), PageName.ofObject(4)].map((name) => ({ name }) as PageInfo);

function opened() {
  const doc = PdfLiveChanges.load();
  const steps: unknown[] = [];
  // How the open steps ended, by their place.
  const ended: { closed: unknown[]; discarded: unknown[] } = { closed: [], discarded: [] };
  return {
    doc,
    steps,
    ended,
    ready: {
      pages: PAGES,
      storedFile: 'ab'.repeat(32) as BlobKey,
      binding: { doc } as never,
      undo: {
        step: <Made,>(place: unknown, made: () => Made) => {
          steps.push(place);
          return made();
        },
        open: (place: unknown) => {
          steps.push(place);
          return {
            close: () => ended.closed.push(place),
            discard: () => ended.discarded.push(place),
          };
        },
      } as never,
    },
  };
}

const SELECTED: PdfTextSelected = {
  page: 1,
  spans: [[0, 5]],
  quads: [QUAD],
  text: 'Lease',
  touch: false,
};

function tools({
  marking = true,
  selected = null as PdfTextSelected | null,
  open = opened(),
  isOpen = true,
} = {}) {
  const clearSelection = vi.fn();
  const focusPages = vi.fn();
  const onProblem = vi.fn();
  const onStroke = vi.fn();
  const hook = renderHook(
    (props: { selected: PdfTextSelected | null; marking: boolean }) =>
      usePdfMarkTools({
        ready: isOpen ? open.ready : null,
        marking: props.marking,
        author: 'Ada',
        authorKey: 'k-ada',
        selected: props.selected,
        clearSelection,
        focusPages,
        onProblem,
        onStroke,
        identity: { identity: {}, keep: () => null },
      }),
    { initialProps: { selected, marking } },
  );
  const run = (id: string) => act(() => hook.result.current.actions[id]!.run());
  return { hook, run, clearSelection, focusPages, onProblem, onStroke, ...open };
}

const key = (event: Partial<KeyboardEvent<HTMLElement>>) => {
  const preventDefault = vi.fn();
  return {
    event: {
      key: 'u',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault,
      ...event,
    } as unknown as KeyboardEvent<HTMLElement>,
    preventDefault,
  };
};

beforeEach(() => {
  vi.mocked(track).mockClear();
  vi.mocked(debugLog).mockClear();
});

afterEach(() => {
  localStorage.clear();
  resetTextMarkPick();
  resetShapePick();
  resetTypedPick();
  resetStampPick();
  resetDrawingPick();
});

describe('the text tools', () => {
  it('binds nothing before the PDF is open, and only Select outside Reviewing', () => {
    expect(tools({ isOpen: false }).hook.result.current.actions).toEqual({});
    const viewing = tools({ marking: false });
    expect(Object.keys(viewing.hook.result.current.actions)).toEqual([TOOL_SELECT]);
    expect(viewing.hook.result.current.choices).toEqual({});
    expect(viewing.hook.result.current.inHand).toBe('select');
  });

  it('takes each tool in hand from its menu item, and Select back', () => {
    const { hook, run } = tools();
    for (const [item, kind, name] of [
      [TOOL_HIGHLIGHT, 'highlight', 'Highlight'],
      [TOOL_UNDERLINE, 'underline', 'Underline'],
      [TOOL_STRIKETHROUGH, 'strikeout', 'Strikethrough'],
      [TOOL_SQUIGGLY, 'squiggly', 'SquigglyUnderline'],
    ] as const) {
      run(item);
      expect(hook.result.current.inHand).toBe(kind);
      expect(hook.result.current.actions[item]!.checked).toBe(true);
      expect(track).toHaveBeenLastCalledWith('Pdf', 'Selected', `Tool.${name}`);
    }
    run(TOOL_SELECT);
    expect(hook.result.current.inHand).toBe('select');
    expect(hook.result.current.actions[TOOL_SELECT]!.checked).toBe(true);
    expect(track).toHaveBeenLastCalledWith('Pdf', 'Selected', 'Tool.Select');
  });

  it('puts the tool down outside Reviewing, and takes it up again in Reviewing', () => {
    const { hook, run } = tools();
    run(TOOL_UNDERLINE);
    hook.rerender({ selected: null, marking: false });
    expect(hook.result.current.inHand).toBe('select');
    hook.rerender({ selected: null, marking: true });
    expect(hook.result.current.inHand).toBe('underline');
  });

  // marks.md "Making a mark": a drag across a line's text marks it with the tool in hand.
  it('marks what a drag covered with the tool in hand, carrying the author key, one step of undo on its page', () => {
    const { hook, run, doc, steps, onProblem } = tools();
    act(() => hook.result.current.make(0, { text: 'Lease', quads: [QUAD] }));
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
    run(TOOL_STRIKETHROUGH);
    act(() => hook.result.current.make(0, { text: 'Lease', quads: [QUAD] }));
    expect(PdfLiveChanges.marks(doc)).toEqual([
      expect.objectContaining({
        kind: 'strikeout',
        page: PAGES[0]!.name,
        author: 'Ada',
        authorKey: 'k-ada',
        colour: TEXT_MARK_LOOKS.strikeout.colour,
      }),
    ]);
    expect(steps).toEqual([{ page: PAGES[0]!.name }]);
    expect(debugLog).toHaveBeenCalledWith('[pdf] mark-added kind=strikeout');
    expect(track).toHaveBeenLastCalledWith('Pdf', 'Added', 'Mark.Strikethrough');
    expect(onProblem).toHaveBeenLastCalledWith(null);
  });

  it('makes nothing on a page that is not there', () => {
    const { hook, run, doc } = tools();
    run(TOOL_HIGHLIGHT);
    act(() => hook.result.current.make(9, { text: 'Lease', quads: [QUAD] }));
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
  });

  // marks.md "Limits": past PDF_MAX_MARKS the mark is refused, and said.
  it('says so when the PDF holds the most marks it may', () => {
    const open = opened();
    open.doc.transact(() => {
      const marks = open.doc.getMap('marks');
      for (let n = 0; n < PDF_MAX_MARKS; n += 1) marks.set(`m${n}`, 1);
    });
    const { hook, run, onProblem } = tools({ open });
    run(TOOL_HIGHLIGHT);
    act(() => hook.result.current.make(0, { text: 'Lease', quads: [QUAD] }));
    expect(onProblem).toHaveBeenLastCalledWith(TOO_MANY_MARKS_COPY);
    expect(debugLog).toHaveBeenCalledWith('[pdf] limit-refused name=pdf_too_many_marks');
    // A drag that covered no text makes nothing and says nothing.
    onProblem.mockClear();
    act(() => hook.result.current.make(0, { text: '', quads: [] }));
    expect(onProblem).not.toHaveBeenCalled();
  });
});

// marks.md "Making a mark": a text tool chosen with text selected marks the selection, the tool left as it was.
describe('a text tool on a selection', () => {
  it('marks the selection at once and clears it, from a menu item or the selection’s own', () => {
    const { hook, run, doc, clearSelection, steps } = tools({ selected: SELECTED });
    run(TOOL_SQUIGGLY);
    run(UNDERLINE_SELECTION);
    run(HIGHLIGHT_SELECTION);
    run(STRIKETHROUGH_SELECTION);
    expect(
      PdfLiveChanges.marks(doc)
        .map((mark) => mark.kind)
        .toSorted(),
    ).toEqual(['highlight', 'squiggly', 'strikeout', 'underline']);
    expect(steps).toEqual(Array(4).fill({ page: PAGES[1]!.name }));
    expect(clearSelection).toHaveBeenCalledTimes(4);
    expect(hook.result.current.inHand).toBe('select');
    // The held tool last used is the Highlight control's.
    expect(textMarkPick()).toBe('strikeout');
  });

  it('offers the selection’s items only while there is one', () => {
    const { hook } = tools();
    expect(hook.result.current.actions[HIGHLIGHT_SELECTION]).toBeUndefined();
    hook.rerender({ selected: SELECTED, marking: true });
    expect(hook.result.current.actions[HIGHLIGHT_SELECTION]).toBeDefined();
  });
});

// reading-surface.md "The toolbar": Highlight holds Underline and Strikethrough and remembers the last one used.
describe('the Highlight control', () => {
  it('takes the held tool last used, shows it, and is pressed again back to Select', () => {
    const { hook, run } = tools();
    const control = () => hook.result.current.actions[TEXT_MARK_TOOLS]!;
    expect(control().label).toBe('Highlight');
    expect(control().checked).toBe(false);
    run(TEXT_MARK_TOOLS);
    expect(hook.result.current.inHand).toBe('highlight');
    expect(control().checked).toBe(true);
    run(TEXT_MARK_TOOLS);
    expect(hook.result.current.inHand).toBe('select');

    const choice = hook.result.current.choices[TEXT_MARK_TOOLS]!;
    expect(choice.grid!.cells.map((cell) => [cell.id, cell.label])).toEqual([
      [TOOL_HIGHLIGHT, 'Highlight'],
      [TOOL_UNDERLINE, 'Underline'],
      [TOOL_STRIKETHROUGH, 'Strikethrough'],
    ]);
    act(() => choice.actions[TOOL_UNDERLINE]!.run());
    expect(hook.result.current.inHand).toBe('underline');
    expect(control().label).toBe('Underline');
    const now = hook.result.current.choices[TEXT_MARK_TOOLS]!;
    expect(now.read()).toBe(TOOL_UNDERLINE);
    const glyphOf = (at: number) => {
      const cell = now.grid!.cells[at]!;
      return 'icon' in cell ? cell.icon : null;
    };
    expect(now.iconOf!(TOOL_STRIKETHROUGH)).toBe(glyphOf(2));
    expect(now.iconOf!(null)).toBe(glyphOf(1));
    // The squiggly underline is not one it holds: it leaves the control as it was.
    run(TOOL_SQUIGGLY);
    expect(control().label).toBe('Underline');
    expect(control().checked).toBe(false);
  });

  it('marks a selection with the held tool rather than putting it down', () => {
    const { hook, run, doc } = tools();
    run(TEXT_MARK_TOOLS);
    hook.rerender({ selected: SELECTED, marking: true });
    run(TEXT_MARK_TOOLS);
    expect(PdfLiveChanges.marks(doc).map((mark) => mark.kind)).toEqual(['highlight']);
    expect(hook.result.current.inHand).toBe('highlight');
  });
});

// keyboard-shortcuts.md "Tools": U Highlight; ⇧U cycles Highlight, Underline, Strikethrough; V and Escape to Select.
describe('the tools’ keys', () => {
  it('takes Highlight with U, cycles with ⇧U, and returns to Select with V or Escape', () => {
    const { hook } = tools();
    const press = (event: Partial<KeyboardEvent<HTMLElement>>) => {
      const { event: e, preventDefault } = key(event);
      let taken = false;
      act(() => {
        taken = hook.result.current.onKey(e);
      });
      return { taken, prevented: preventDefault.mock.calls.length > 0 };
    };
    expect(press({ key: 'U' })).toEqual({ taken: true, prevented: true });
    expect(hook.result.current.inHand).toBe('highlight');
    const cycle = ['underline', 'strikeout', 'highlight', 'underline'].map(() => {
      press({ key: 'U', shiftKey: true });
      return hook.result.current.inHand;
    });
    expect(cycle).toEqual(['underline', 'strikeout', 'highlight', 'underline']);
    expect(press({ key: 'Escape' }).taken).toBe(true);
    expect(hook.result.current.inHand).toBe('select');
    // From Select, or the squiggly underline, ⇧U starts at Highlight.
    press({ key: 'U', shiftKey: true });
    expect(hook.result.current.inHand).toBe('highlight');
    press({ key: 'v' });
    expect(hook.result.current.inHand).toBe('select');
    // V with Select in hand, a key held with a modifier, and any other key are not the tools'.
    expect(press({ key: 'v' }).taken).toBe(false);
    expect(press({ key: 'u', ctrlKey: true })).toEqual({ taken: false, prevented: false });
    expect(press({ key: 'u', metaKey: true }).taken).toBe(false);
    expect(press({ key: 'u', altKey: true }).taken).toBe(false);
    expect(press({ key: 'j' }).taken).toBe(false);
    expect(hook.result.current.inHand).toBe('select');
    // Q takes the Cloud.
    expect(press({ key: 'q' }).taken).toBe(true);
    expect(hook.result.current.inHand).toBe('cloud');
    expect(press({ key: 'Q', shiftKey: true }).taken).toBe(false);
  });

  it('marks a selection with U, and takes no tool outside Reviewing', () => {
    const { hook, doc } = tools({ selected: SELECTED });
    act(() => void hook.result.current.onKey(key({ key: 'u' }).event));
    expect(PdfLiveChanges.marks(doc)).toHaveLength(1);
    hook.rerender({ selected: null, marking: false });
    expect(hook.result.current.onKey(key({ key: 'u' }).event)).toBe(false);
    expect(hook.result.current.inHand).toBe('select');
  });
});

// marks.md "Making a mark": a tool's colour, from the toolbar's Colour, while a mark tool is in hand.
describe('the tool in hand’s colour', () => {
  afterEach(() => resetMarkLooks());

  it('is none with Select in hand, and the tool’s own colour, set and reset, with a tool', () => {
    const { hook, run, doc, focusPages } = tools();
    expect(hook.result.current.colours).toEqual({});
    run(TOOL_UNDERLINE);
    const colour = () => hook.result.current.colours[TOOL_COLOUR]!;
    expect(colour().leading).toBe('Reset');
    expect(colour().read()).toBe(TEXT_MARK_LOOKS.underline.colour);
    act(() => colour().set('#7c3aed'));
    expect(track).toHaveBeenLastCalledWith('Pdf', 'Changed', 'ToolColour');
    // A pick gives the pages the keys again.
    expect(focusPages).toHaveBeenCalledOnce();
    expect(colour().read()).toBe('#7c3aed');
    // A new mark takes it.
    act(() => hook.result.current.make(0, { text: 'Lease', quads: [QUAD] }));
    expect(PdfLiveChanges.marks(doc)[0]!.colour).toBe('#7c3aed');
    act(() => colour().set(null));
    expect(colour().read()).toBe(TEXT_MARK_LOOKS.underline.colour);
  });
});

// marks.md "Changing a mark": Erase on the Drawing control; reading-surface.md "The toolbar": Drawing holds Drawing and
// Erase, remembered apart; D takes the Drawing.
describe('the Erase tool', () => {
  it('is taken from Insert or the Drawing control, which then shows it, and erases one step on its page', () => {
    const { hook, run, doc, steps } = tools();
    expect(hook.result.current.erasing).toBeNull();
    const control = () => hook.result.current.actions[DRAWING_TOOLS]!;
    expect(control().label).toBe('Drawing');
    run(TOOL_ERASE);
    expect(hook.result.current.inHand).toBe('erase');
    expect(track).toHaveBeenLastCalledWith('Pdf', 'Selected', 'Tool.Erase');
    expect(control()).toMatchObject({ label: 'Erase', checked: true });
    expect(drawingPick()).toBe('erase');
    // Erase has no colour of its own, and gives the pages no ink.
    expect(hook.result.current.colours).toEqual({});
    expect(hook.result.current.ink).toBeNull();
    const mark = Mark.drawing({
      id: 'd',
      page: PAGES[0]!.name,
      strokes: [[1, 1, 9, 9]],
      width: 2,
      colour: '#d93025',
      opacity: 1,
      author: 'Ada',
      createdAt: 1,
    })!;
    PdfLiveChanges.addMark(doc, mark);
    act(() => hook.result.current.erasing!.onErase(0, [{ mark, gone: [0] }]));
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
    expect(steps).toEqual([{ page: PAGES[0]!.name }]);
    expect(debugLog).toHaveBeenLastCalledWith('[pdf] strokes-erased strokes=1 marks=1 deleted=1');
    expect(track).toHaveBeenLastCalledWith('Pdf', 'Changed', 'Mark.Erased');
    // Nothing erased is no step; D takes the Drawing, the control pressed again Select.
    act(() => hook.result.current.erasing!.onErase(0, []));
    act(() => hook.result.current.erasing!.onErase(9, [{ mark, gone: [0] }]));
    expect(steps).toHaveLength(1);
    act(() => void hook.result.current.onKey(key({ key: 'd' }).event));
    expect(hook.result.current.inHand).toBe('drawing');
    expect(hook.result.current.erasing).toBeNull();
    run(DRAWING_TOOLS);
    expect(hook.result.current.inHand).toBe('select');
  });
});

// marks.md "Making a mark": A Drawing; keyboard-shortcuts.md "Tools": D.
describe('the Drawing tool', () => {
  it('is taken by its item or D, gives the pages its ink, and draws in its colour', () => {
    const { hook, run, doc, onStroke } = tools();
    expect(hook.result.current.ink).toBeNull();
    run(TOOL_DRAWING);
    expect(hook.result.current.inHand).toBe('drawing');
    expect(hook.result.current.actions[TOOL_DRAWING]!.checked).toBe(true);
    expect(track).toHaveBeenLastCalledWith('Pdf', 'Selected', 'Tool.Drawing');
    expect(hook.result.current.ink).toMatchObject({ ...DRAWING_LOOK, width: DRAWING_WIDTH_PT });
    // A text drag with the Drawing tool in hand marks nothing.
    act(() => hook.result.current.make(0, { text: 'Lease', quads: [QUAD] }));
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
    act(() => hook.result.current.colours[TOOL_COLOUR]!.set('#7c3aed'));
    act(() => hook.result.current.ink!.onDraw(0, [1, 1, 5, 5], Date.now()));
    // The stroke as it grows goes out with the tool's look (live-editing-and-storage.md "A mark as it is made").
    hook.result.current.ink!.onStroke(0, [1, 1]);
    expect(onStroke).toHaveBeenLastCalledWith(0, [1, 1], {
      colour: '#7c3aed',
      opacity: DRAWING_LOOK.opacity,
      width: DRAWING_WIDTH_PT,
    });
    expect(PdfLiveChanges.marks(doc)).toEqual([
      expect.objectContaining({ kind: 'drawing', colour: '#7c3aed' }),
    ]);
    run(TOOL_SELECT);
    act(() => void hook.result.current.onKey(key({ key: 'd' }).event));
    expect(hook.result.current.inHand).toBe('drawing');
  });
});

// marks.md "Making a mark": the shape tools; reading-surface.md "The toolbar": Shape holds them and remembers the last;
// keyboard-shortcuts.md "Tools": ⇧D.
describe('the shape tools', () => {
  it('are taken by their items, counted, and give the pages a shaping in the kind’s look', () => {
    const { hook, run, doc } = tools();
    expect(hook.result.current.shaping).toBeNull();
    run(TOOL_RECTANGLE);
    expect(hook.result.current.inHand).toBe('rectangle');
    expect(hook.result.current.actions[TOOL_RECTANGLE]!.checked).toBe(true);
    expect(track).toHaveBeenLastCalledWith('Pdf', 'Selected', 'Tool.Rectangle');
    expect(shapePick()).toBe('rectangle');
    expect(hook.result.current.shaping).toMatchObject({
      kind: 'rectangle',
      ...SHAPE_LOOK,
      width: SHAPE_WIDTH_PT,
    });
    expect(hook.result.current.ink).toBeNull();
    // A text drag with a shape tool in hand marks nothing.
    act(() => hook.result.current.make(0, { text: 'Lease', quads: [QUAD] }));
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
    act(() => hook.result.current.colours[TOOL_COLOUR]!.set('#1a73e8'));
    act(() =>
      hook.result.current.shaping!.onShape(1, {
        kind: 'rectangle',
        rect: [1, 1, 50, 50],
        width: 2,
      }),
    );
    expect(PdfLiveChanges.marks(doc)).toEqual([
      expect.objectContaining({ kind: 'rectangle', colour: '#1a73e8', page: PAGES[1]!.name }),
    ]);
    expect(track).toHaveBeenLastCalledWith('Pdf', 'Added', 'Mark.Rectangle');
  });

  // marks.md "Making a mark": A tool’s line, which the next mark of the kind takes.
  it('draws and makes a shape in its tool’s remembered width, line style and fill', () => {
    const { hook, run, doc } = tools();
    run(TOOL_ELLIPSE);
    act(() => hook.result.current.lineActions['line-width-8-pt']!.run());
    act(() => hook.result.current.lineActions['line-style-dotted']!.run());
    act(() => hook.result.current.colours[FILL_COLOUR]!.set('#fde68a'));
    expect(hook.result.current.shaping).toMatchObject({
      kind: 'ellipse',
      width: 8,
      lineStyle: 'dotted',
      fill: '#fde68a',
    });
    act(() =>
      hook.result.current.shaping!.onShape(0, { kind: 'ellipse', rect: [1, 1, 50, 50], width: 8 }),
    );
    expect(PdfLiveChanges.marks(doc)).toEqual([
      expect.objectContaining({ kind: 'ellipse', width: 8, lineStyle: 'dotted', fill: '#fde68a' }),
    ]);
    run(TOOL_DRAWING);
    act(() => hook.result.current.lineActions['line-width-12-pt']!.run());
    expect(hook.result.current.ink).toMatchObject({ width: 12 });
    expect(hook.result.current.colours[FILL_COLOUR]).toBeUndefined();
    run(TOOL_SELECT);
    expect(hook.result.current.lineActions).toEqual({});
  });

  it('shows the last shape taken on the Shape control, which puts it down when pressed again', () => {
    const { hook, run } = tools();
    const control = () => hook.result.current.actions[SHAPE_TOOLS]!;
    expect(control().label).toBe('Line');
    run(SHAPE_TOOLS);
    expect(hook.result.current.inHand).toBe('line');
    expect(control().checked).toBe(true);
    run(SHAPE_TOOLS);
    expect(hook.result.current.inHand).toBe('select');
    const choice = hook.result.current.choices[SHAPE_TOOLS]!;
    expect(choice.grid!.cells.map((cell) => [cell.id, cell.label])).toEqual([
      [TOOL_LINE, 'Line'],
      [TOOL_ARROW, 'Arrow'],
      [TOOL_RECTANGLE, 'Rectangle'],
      [TOOL_ELLIPSE, 'Ellipse'],
      [TOOL_POLYGON, 'Polygon'],
      [TOOL_CLOUD, 'Cloud'],
      [TOOL_CONNECTED_LINES, 'Connected lines'],
    ]);
    act(() => choice.actions[TOOL_ELLIPSE]!.run());
    expect(control().label).toBe('Ellipse');
    const now = hook.result.current.choices[SHAPE_TOOLS]!;
    expect(now.read()).toBe(TOOL_ELLIPSE);
    const glyphOf = (at: number) => {
      const cell = now.grid!.cells[at]!;
      return 'icon' in cell ? cell.icon : null;
    };
    expect(now.iconOf!(TOOL_ARROW)).toBe(glyphOf(1));
    expect(now.iconOf!(null)).toBe(glyphOf(3));
    // The Drawing is not one it holds.
    run(TOOL_DRAWING);
    expect(control().checked).toBe(false);
    expect(control().label).toBe('Ellipse');
  });

  it('steps through the shapes with ⇧D, from another tool taking the one the control shows', () => {
    const { hook } = tools();
    const press = () => {
      let taken = false;
      act(() => {
        taken = hook.result.current.onKey(key({ key: 'D', shiftKey: true }).event);
      });
      return taken;
    };
    expect(press()).toBe(true);
    expect(hook.result.current.inHand).toBe('line');
    const seen: string[] = [];
    for (let step = 0; step < 7; step += 1) {
      press();
      seen.push(hook.result.current.inHand);
    }
    expect(seen).toEqual(['arrow', 'rectangle', 'ellipse', 'polygon', 'cloud', 'polyline', 'line']);
    press();
    act(() => void hook.result.current.onKey(key({ key: 'd' }).event));
    expect(hook.result.current.inHand).toBe('drawing');
    press();
    expect(hook.result.current.inHand).toBe('arrow');
  });

  it('takes no shape outside Reviewing', () => {
    const { hook } = tools({ marking: false });
    expect(hook.result.current.actions[SHAPE_TOOLS]).toBeUndefined();
    expect(hook.result.current.onKey(key({ key: 'D', shiftKey: true }).event)).toBe(false);
  });
});

// marks.md "Making a mark": the typing tools, Text and Callout; reading-surface.md "The toolbar": Text holds them and
// remembers the last; keyboard-shortcuts.md "Tools": X and ⇧X; "Telemetry and observability".
describe('the typing tools', () => {
  const typed = {
    kind: 'text',
    rect: [10, 10, 90, 30],
    words: 'Check',
    size: 12,
    callout: null,
  } as const;

  it('are taken by their items, counted, and give the pages a typing in the kind’s look', () => {
    const { hook, run, doc, steps } = tools();
    expect(hook.result.current.typing).toBeNull();
    run(TOOL_TEXT);
    expect(hook.result.current.inHand).toBe('text');
    expect(hook.result.current.actions[TOOL_TEXT]!.checked).toBe(true);
    expect(track).toHaveBeenLastCalledWith('Pdf', 'Selected', 'Tool.Text');
    expect(hook.result.current.typing).toMatchObject({
      kind: 'text',
      ...TYPED_LOOK,
      size: TYPED_SIZE_PT,
      tip: null,
    });
    // A text drag with a typing tool in hand marks nothing.
    act(() => hook.result.current.make(0, { text: 'Lease', quads: [QUAD] }));
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
    act(() => hook.result.current.colours[TOOL_COLOUR]!.set('#1a73e8'));
    act(() => hook.result.current.typing!.onTyped(1, 'text', typed));
    expect(PdfLiveChanges.marks(doc)).toEqual([
      expect.objectContaining({
        kind: 'text',
        words: 'Check',
        colour: '#1a73e8',
        page: PAGES[1]!.name,
      }),
    ]);
    expect(steps).toEqual([{ page: PAGES[1]!.name }]);
    expect(track).toHaveBeenLastCalledWith('Pdf', 'Added', 'Mark.Text');
    expect(debugLog).toHaveBeenLastCalledWith('[pdf] mark-added kind=text');
  });

  it('makes nothing of a box ended with nothing typed, or on no page, and says so', () => {
    const { hook, run, doc, steps } = tools();
    run(TOOL_TEXT);
    act(() => hook.result.current.typing!.onTyped(0, 'text', null));
    expect(debugLog).toHaveBeenLastCalledWith('[pdf] typing-dropped kind=text');
    act(() => hook.result.current.typing!.onTyped(5, 'text', typed));
    // A Callout with no line is no Callout.
    act(() => hook.result.current.typing!.onTyped(0, 'callout', { ...typed, kind: 'callout' }));
    expect(debugLog).toHaveBeenLastCalledWith('[pdf] mark-refused name=no_words');
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
    expect(steps).toHaveLength(1);
  });

  it('is refused past PDF_MAX_MARKS, which the title row says', () => {
    const { hook, run, doc, onProblem } = tools();
    doc.transact(() => {
      const marks = doc.getMap('marks');
      for (let n = 0; n < PDF_MAX_MARKS; n += 1) marks.set(`m${n}`, 1);
    });
    run(TOOL_TEXT);
    act(() => hook.result.current.typing!.onTyped(0, 'text', typed));
    expect(onProblem).toHaveBeenLastCalledWith(TOO_MANY_MARKS_COPY);
    expect(debugLog).toHaveBeenLastCalledWith('[pdf] limit-refused name=pdf_too_many_marks');
  });

  // live-editing-and-storage.md "A mark as it is made".
  it('relays the words as they are typed: the first character makes the mark, each next changes it, one step', () => {
    const { hook, run, doc, steps, ended } = tools();
    run(TOOL_TEXT);
    act(() => hook.result.current.typing!.onWords(1, 'text', { ...typed, words: 'C' }));
    const [made] = PdfLiveChanges.marks(doc);
    expect(made).toMatchObject({ kind: 'text', words: 'C', page: PAGES[1]!.name });
    expect(hook.result.current.typing!.id).toBe(made!.id);
    act(() => hook.result.current.typing!.onWords(1, 'text', typed));
    expect(PdfLiveChanges.marks(doc)).toEqual([
      expect.objectContaining({ id: made!.id, words: 'Check' }),
    ]);
    act(() => hook.result.current.typing!.onTyped(1, 'text', { ...typed, words: 'Check it' }));
    expect(PdfLiveChanges.marks(doc)).toEqual([expect.objectContaining({ words: 'Check it' })]);
    expect(steps).toEqual([{ page: PAGES[1]!.name }]);
    expect(ended.closed).toEqual(steps);
    expect(hook.result.current.typing!.id).toBeNull();
    expect(debugLog).toHaveBeenLastCalledWith('[pdf] mark-added kind=text');
  });

  it('takes the mark away while emptied, and leaves no step where the box ends empty', () => {
    const { hook, run, doc, ended } = tools();
    run(TOOL_TEXT);
    act(() => hook.result.current.typing!.onWords(0, 'text', { ...typed, words: 'C' }));
    act(() => hook.result.current.typing!.onWords(0, 'text', null));
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
    act(() => hook.result.current.typing!.onTyped(0, 'text', null));
    expect(ended).toEqual({ closed: [], discarded: [{ page: PAGES[0]!.name }] });
    expect(debugLog).toHaveBeenLastCalledWith('[pdf] typing-dropped kind=text');
  });

  it('keeps what was typed, one step, where the tool is put down mid-box', () => {
    const { hook, run, doc, ended } = tools();
    run(TOOL_TEXT);
    act(() => hook.result.current.typing!.onWords(0, 'text', { ...typed, words: 'C' }));
    run(TOOL_SELECT);
    expect(PdfLiveChanges.marks(doc)).toEqual([expect.objectContaining({ words: 'C' })]);
    expect(ended.closed).toEqual([{ page: PAGES[0]!.name }]);
  });

  it('stops writing a box refused past PDF_MAX_MARKS, saying so once', () => {
    const { hook, run, doc, onProblem } = tools();
    doc.transact(() => {
      const marks = doc.getMap('marks');
      for (let n = 0; n < PDF_MAX_MARKS; n += 1) marks.set(`m${n}`, 1);
    });
    run(TOOL_TEXT);
    act(() => hook.result.current.typing!.onWords(0, 'text', { ...typed, words: 'C' }));
    act(() => hook.result.current.typing!.onWords(0, 'text', typed));
    act(() => hook.result.current.typing!.onTyped(0, 'text', typed));
    expect(onProblem).toHaveBeenCalledTimes(1);
    expect(onProblem).toHaveBeenLastCalledWith(TOO_MANY_MARKS_COPY);
    expect(debugLog).toHaveBeenLastCalledWith('[pdf] limit-refused name=pdf_too_many_marks');
  });

  it('keeps a Callout’s first press across the pages until another tool is taken', () => {
    const { hook, run } = tools();
    run(TOOL_CALLOUT);
    expect(track).toHaveBeenLastCalledWith('Pdf', 'Selected', 'Tool.Callout');
    act(() => hook.result.current.typing!.onTip(1, { x: 5, y: 6 }));
    expect(hook.result.current.typing!.tip).toEqual({ index: 1, at: { x: 5, y: 6 } });
    act(() => hook.result.current.typing!.onTip(1, null));
    expect(hook.result.current.typing!.tip).toBeNull();
    act(() => hook.result.current.typing!.onTip(0, { x: 1, y: 1 }));
    run(TOOL_TEXT);
    expect(hook.result.current.typing!.tip).toBeNull();
  });

  it('shows the last taken on the Text control, and takes it with X, the other with ⇧X', () => {
    const { hook, run } = tools();
    const control = () => hook.result.current.actions[TYPED_TOOLS]!;
    expect(control().label).toBe('Text');
    const choice = hook.result.current.choices[TYPED_TOOLS]!;
    expect(choice.grid!.cells.map((cell) => [cell.id, cell.label])).toEqual([
      [TOOL_TEXT, 'Text'],
      [TOOL_CALLOUT, 'Callout'],
    ]);
    const press = (shiftKey: boolean) =>
      act(() => void hook.result.current.onKey(key({ key: shiftKey ? 'X' : 'x', shiftKey }).event));
    press(false);
    expect(hook.result.current.inHand).toBe('text');
    press(true);
    expect(hook.result.current.inHand).toBe('callout');
    expect(control().label).toBe('Callout');
    press(true);
    expect(hook.result.current.inHand).toBe('text');
    run(TOOL_CALLOUT);
    run(TOOL_SELECT);
    press(false);
    expect(hook.result.current.inHand).toBe('callout');
  });

  it('takes no typing tool outside Reviewing', () => {
    const { hook } = tools({ marking: false });
    expect(hook.result.current.actions[TYPED_TOOLS]).toBeUndefined();
    expect(hook.result.current.onKey(key({ key: 'x' }).event)).toBe(false);
  });
});

// marks.md "Stamps": K takes the Stamp tool; a stamp's colour is its own, so no Colour; keyboard-shortcuts.md "Tools".
describe('the Stamp tool', () => {
  it('is taken by K or its control, counted, gives the pages a press and offers no colour', () => {
    const { hook, run } = tools();
    expect(hook.result.current.stamping).toBeNull();
    act(() => void hook.result.current.onKey(key({ key: 'k' }).event));
    expect(hook.result.current.inHand).toBe('stamp');
    expect(track).toHaveBeenLastCalledWith('Pdf', 'Selected', 'Tool.Stamp');
    expect(hook.result.current.stamping).not.toBeNull();
    expect(hook.result.current.colours).toEqual({});
    expect(hook.result.current.actions[STAMP_TOOLS]!.checked).toBe(true);
    expect(hook.result.current.choices[STAMP_TOOLS]!.grid!.cells).toHaveLength(23);
    run(STAMP_TOOLS);
    expect(hook.result.current.inHand).toBe('select');
  });

  it('takes nothing with ⇧K, or outside Reviewing', () => {
    expect(tools().hook.result.current.onKey(key({ key: 'K', shiftKey: true }).event)).toBe(false);
    const { hook } = tools({ marking: false });
    expect(hook.result.current.actions[STAMP_TOOLS]).toBeUndefined();
    expect(hook.result.current.onKey(key({ key: 'k' }).event)).toBe(false);
  });
});
