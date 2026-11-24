// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Making a mark", "Telemetry and observability"; reading-surface.md "The
// toolbar"; keyboard-shortcuts.md "Tools": the text tools, the Highlight control and its chevron, the selection's
// mark items, the tools' keys, and a mark made as one step of the person's undo.
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import {
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
  TOOL_HIGHLIGHT,
  TOOL_SELECT,
  TOOL_SQUIGGLY,
  TOOL_STRIKETHROUGH,
  TOOL_UNDERLINE,
} from './pdf-menus';
import { TOO_MANY_MARKS_COPY } from './pdf-surface-copy';
import { TEXT_MARK_LOOKS } from './pdf-text-mark';
import { resetTextMarkPick, textMarkPick } from './pdf-text-mark-pick';
import { resetTextMarkLooks } from './pdf-mark-looks';
import { TEXT_MARK_TOOLS, TOOL_COLOUR } from './pdf-toolbar';
import { usePdfMarkTools } from './usePdfMarkTools';
import type { PdfTextSelected } from './usePdfTextSelection';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const QUAD: Quad = [72, 730, 300, 730, 72, 716, 300, 716];
const PAGES = [PageName.ofObject(3), PageName.ofObject(4)].map((name) => ({ name }) as PageInfo);

function opened() {
  const doc = PdfLiveChanges.load();
  const steps: unknown[] = [];
  return {
    doc,
    steps,
    ready: {
      pages: PAGES,
      storedFile: 'ab'.repeat(32) as BlobKey,
      binding: { doc } as never,
      undo: {
        step: <Made,>(place: unknown, made: () => Made) => {
          steps.push(place);
          return made();
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
  const hook = renderHook(
    (props: { selected: PdfTextSelected | null; marking: boolean }) =>
      usePdfMarkTools({
        ready: isOpen ? open.ready : null,
        marking: props.marking,
        author: 'Ada',
        selected: props.selected,
        clearSelection,
        focusPages,
        onProblem,
      }),
    { initialProps: { selected, marking } },
  );
  const run = (id: string) => act(() => hook.result.current.actions[id]!.run());
  return { hook, run, clearSelection, focusPages, onProblem, ...open };
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
  it('marks what a drag covered with the tool in hand, one step of undo on its page', () => {
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
    expect(press({ key: 'x' }).taken).toBe(false);
    expect(hook.result.current.inHand).toBe('select');
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
  afterEach(() => resetTextMarkLooks());

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
