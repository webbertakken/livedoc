// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CandidateContextElement, Element } from '@livedoc/document';
import { CanvasZoomProvider } from '@/components/canvas/CanvasZoomContext';
import type { ContextControls, SuggestionControls } from '@/components/canvas/Canvas.types';
import { clearLocalPreview, setLocalPreview } from '@/lib/drag-preview';
import { endSuggestionPreview, previewSuggestion } from '@/lib/suggestion-view';
import { resetContextSelectionForTests, setDrawingContext } from '@/lib/context-selection';
import { ContextLayer } from './ContextLayer';

// Candidate contexts on the canvas (docs/specs/021-event-storming/candidate-contexts.md): the outline and its name,
// selecting, renaming and deleting a kept one, applying and dismissing a suggested one, and the outline a dragged
// note would join.

const TAB = 'tab-1';

const note = (id: string, x: number, extra: Record<string, unknown> = {}): Element => ({
  id,
  type: 'sticky',
  x,
  y: 480,
  width: 200,
  height: 200,
  label: id,
  esKind: 'domain-event',
  ...extra,
});
const context = (id: string, notes: string[], suggested = false): CandidateContextElement => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  label: `Ctx ${id}`,
  esContext: { notes, ...(suggested ? { suggestion: { reason: 'r' } } : {}) },
});

const board: Element[] = [
  note('a', 0),
  note('b', 300),
  note('c', 2000),
  context('k', ['a', 'b']),
  context('s', ['c'], true),
];

const contextControls = (): ContextControls => ({
  rename: vi.fn(),
  remove: vi.fn(),
  addNotes: vi.fn(),
  removeNotes: vi.fn(),
  merge: vi.fn(() => 'k'),
  create: vi.fn(() => 'made'),
  clearSelection: vi.fn(),
});
const suggestionControls = (): SuggestionControls => ({
  apply: vi.fn(),
  dismiss: vi.fn(),
  applyAll: vi.fn(),
  dismissAll: vi.fn(),
  reveal: vi.fn(),
});

function draw(
  elements: Element[],
  opts: {
    contexts?: ContextControls;
    suggestions?: SuggestionControls;
    showSuggested?: boolean;
    layers?: Parameters<typeof ContextLayer>[0]['layers'];
  } = {},
) {
  return render(
    <CanvasZoomProvider zoom={1}>
      <ContextLayer
        part="lines"
        elements={elements}
        tabId={TAB}
        layers={opts.layers}
        contexts={opts.contexts}
        showSuggested={opts.showSuggested ?? opts.suggestions !== undefined}
        suggestions={opts.suggestions}
        shiftX={() => undefined}
      />
      <ContextLayer
        part="names"
        elements={elements}
        tabId={TAB}
        layers={opts.layers}
        contexts={opts.contexts}
        showSuggested={opts.showSuggested ?? opts.suggestions !== undefined}
        suggestions={opts.suggestions}
        shiftX={() => undefined}
      />
    </CanvasZoomProvider>,
  );
}

const outline = (id: string) =>
  document.querySelector<SVGPathElement>(`[data-candidate-context="${id}"] path`);
const shown = () =>
  [
    ...document.querySelectorAll<HTMLElement>(
      '[data-testid="context-lines"] [data-candidate-context]',
    ),
  ].map((el) => el.dataset.candidateContext);

afterEach(() => {
  cleanup();
  resetContextSelectionForTests();
  clearLocalPreview();
  endSuggestionPreview(TAB);
});

describe('ContextLayer: what everyone sees', () => {
  it('draws a kept context dashed round its notes, its name on the top edge, and acts on nothing', () => {
    draw(board);
    expect(shown()).toEqual(['k']);
    expect(outline('k')!.getAttribute('stroke-dasharray')).toBe('10 10');
    expect(screen.getByText('Ctx k')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('[data-context-line]')).toBeNull();
  });

  it('draws nothing when no context has a note showing', () => {
    const { container } = draw(board, {
      layers: [{ id: 'L', name: 'L', visible: false }],
    });
    expect(container.querySelector('[data-testid="context-lines"]')).toBeNull();
  });
});

describe('ContextLayer: an Editor and a kept context', () => {
  it('selects it from its outline or its name, clearing the editor’s selection', () => {
    const c = contextControls();
    draw(board, { contexts: c });
    const name = screen.getByRole('button', { name: 'Candidate context: Ctx k' });
    fireEvent.click(document.querySelector('[data-context-line="k"]')!);
    expect(document.activeElement).toBe(name);
    expect(c.clearSelection).toHaveBeenCalledTimes(1);
    expect(outline('k')!.getAttribute('stroke-dasharray')).toBeNull();
    // Escape lets go.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(outline('k')!.getAttribute('stroke-dasharray')).toBe('10 10');
    // A press on the name selects it on its click, not its focus.
    fireEvent.pointerDown(name);
    fireEvent.focus(name);
    expect(outline('k')!.getAttribute('stroke-dasharray')).toBe('10 10');
    fireEvent.click(name);
    expect(outline('k')!.getAttribute('stroke-dasharray')).toBeNull();
    // A press on the canvas away from it lets go too.
    fireEvent.pointerDown(document.body);
    expect(outline('k')!.getAttribute('stroke-dasharray')).toBe('10 10');
  });

  it('renames it from Enter or a double-click; Escape keeps the old name', () => {
    const c = contextControls();
    draw(board, { contexts: c });
    const name = () => screen.getByRole('button', { name: 'Candidate context: Ctx k' });
    fireEvent.keyDown(name(), { key: 'Enter' });
    const field = screen.getByRole('textbox', { name: 'Candidate context name' });
    fireEvent.change(field, { target: { value: 'Billing' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(c.rename).toHaveBeenCalledWith('k', 'Billing');
    fireEvent.doubleClick(name());
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(c.rename).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(name(), { key: 'F2' });
    fireEvent.blur(screen.getByRole('textbox'), { target: { value: 'Payments' } });
    expect(c.rename).toHaveBeenLastCalledWith('k', 'Payments');
  });

  it('deletes it with Delete, and lets go with Escape', () => {
    const c = contextControls();
    draw(board, { contexts: c });
    const name = screen.getByRole('button', { name: 'Candidate context: Ctx k' });
    name.focus();
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(document.activeElement).not.toBe(name);
    fireEvent.keyDown(name, { key: 'x' });
    fireEvent.keyDown(name, { key: 'Backspace' });
    expect(c.remove).toHaveBeenCalledWith('k');
  });
});

describe('ContextLayer: a suggested context', () => {
  it('is drawn faint, marked, for someone who sees suggestions, with ✓ and ✕', () => {
    const s = suggestionControls();
    draw(board, { contexts: contextControls(), suggestions: s });
    expect(shown()).toEqual(['k', 's']);
    const svg = document.querySelector<SVGElement>('[data-candidate-context="s"] svg')!;
    expect(svg.style.opacity).toBe('0.5');
    const name = screen.getByRole('button', { name: 'Suggested candidate context: Ctx s, 1 note' });
    expect(screen.getByText('· suggested', { exact: false })).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply suggested candidate context: Ctx s' }),
    );
    expect(s.apply).toHaveBeenCalledWith('s');
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss suggested candidate context: Ctx s' }),
    );
    expect(s.dismiss).toHaveBeenCalledWith('s');
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(s.apply).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(name, { key: 'Delete' });
    expect(s.dismiss).toHaveBeenCalledTimes(2);
    // A suggested context's name opens too: a merged suggestion is named before it is applied.
    fireEvent.doubleClick(name);
    expect(screen.getByRole('textbox', { name: 'Candidate context name' })).toBeTruthy();
  });

  it('is drawn at full strength while previewed, from the panel or its name', () => {
    draw(board, { suggestions: suggestionControls() });
    act(() => previewSuggestion(TAB, 'c:s'));
    const svg = document.querySelector<SVGElement>('[data-candidate-context="s"] svg')!;
    expect(svg.style.opacity).toBe('1');
    const plate = screen.getByRole('button', {
      name: /Suggested candidate context/,
    }).parentElement!;
    fireEvent.pointerLeave(plate);
    fireEvent.pointerEnter(plate);
    fireEvent.focus(screen.getByRole('button', { name: /Suggested candidate context/ }));
    fireEvent.blur(screen.getByRole('button', { name: /Suggested candidate context/ }));
  });

  it('is drawn without its acts while a drag puts them away', () => {
    draw(board, { showSuggested: true });
    expect(shown()).toEqual(['k', 's']);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ContextLayer: a drag in hand', () => {
  it('highlights the outline a dragged note would join, and draws it taking the note in', () => {
    draw(board, { contexts: contextControls() });
    const moved = board.map((el) => (el.id === 'c' ? { ...el, x: 150 } : el));
    act(() => setLocalPreview(TAB, moved, board));
    expect(outline('k')!.getAttribute('stroke')).toBe('var(--ctx-active)');
    act(() => clearLocalPreview());
    expect(outline('k')!.getAttribute('stroke')).toBe('var(--ctx-line)');
  });

  it('never highlights for someone who may not change contexts', () => {
    draw(board);
    const moved = board.map((el) => (el.id === 'c' ? { ...el, x: 150 } : el));
    act(() => setLocalPreview(TAB, moved, board));
    expect(outline('k')!.getAttribute('stroke')).toBe('var(--ctx-line)');
  });
});

describe('ContextLayer: selecting several and merging (candidate-contexts.md)', () => {
  const two: Element[] = [
    note('a', 0),
    note('b', 300),
    note('c', 2000),
    context('k', ['a', 'b'], true),
    context('s', ['c'], true),
  ];
  const offer = () => screen.queryByRole('group', { name: 'Merge 2 contexts' });

  it('Shift-click selects two suggested contexts and offers to merge them', () => {
    const c = contextControls();
    draw(two, { contexts: c, suggestions: suggestionControls() });
    const k = screen.getByRole('button', { name: /Ctx k, 2 notes/ });
    const s = screen.getByRole('button', { name: /Ctx s, 1 note/ });
    fireEvent.click(k);
    expect(offer()).toBeNull();
    fireEvent.click(s, { shiftKey: true });
    expect(offer()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Merge 2 contexts into one' }));
    expect(c.merge).toHaveBeenCalledWith(['k', 's']);
    // The kept one's name opens for typing.
    const field = screen.getByRole('textbox', { name: 'Candidate context name' });
    fireEvent.change(field, { target: { value: 'Joined' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(c.rename).toHaveBeenCalledWith('k', 'Joined');
  });

  it('takes one back out with another Shift-click, from the outline too, and keeps them apart with ✕', () => {
    const c = contextControls();
    draw(two, { contexts: c, suggestions: suggestionControls() });
    fireEvent.click(document.querySelector('[data-context-line="k"]')!, { shiftKey: true });
    fireEvent.click(document.querySelector('[data-context-line="s"]')!, { shiftKey: true });
    expect(offer()).not.toBeNull();
    fireEvent.click(document.querySelector('[data-context-line="s"]')!, { shiftKey: true });
    expect(offer()).toBeNull();
    fireEvent.click(document.querySelector('[data-context-line="s"]')!, { shiftKey: true });
    fireEvent.pointerDown(offer()!);
    expect(offer()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Keep them apart' }));
    expect(offer()).toBeNull();
    expect(c.merge).not.toHaveBeenCalled();
  });

  it('opens nothing when the merge kept nothing, and offers no merge to someone who may not', () => {
    const c = { ...contextControls(), merge: vi.fn(() => null) };
    draw(two, { contexts: c, suggestions: suggestionControls() });
    fireEvent.click(screen.getByRole('button', { name: /^Suggested candidate context: Ctx k/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Suggested candidate context: Ctx s/ }), {
      shiftKey: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Merge 2 contexts into one' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    cleanup();
    resetContextSelectionForTests();
    draw(two, { suggestions: suggestionControls() });
    fireEvent.click(screen.getByRole('button', { name: /^Suggested candidate context: Ctx k/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Suggested candidate context: Ctx s/ }), {
      shiftKey: true,
    });
    expect(offer()).toBeNull();
  });
});

describe('ContextLayer: the name (candidate-contexts.md "The name")', () => {
  const plate = () =>
    document.querySelector<HTMLElement>(
      '[data-testid="context-names"] [data-candidate-context="k"]',
    )!;
  const drawAt = (zoom: number) =>
    render(
      <CanvasZoomProvider zoom={zoom}>
        {(['lines', 'names'] as const).map((part) => (
          <ContextLayer
            key={part}
            part={part}
            elements={board}
            tabId={TAB}
            layers={undefined}
            contexts={contextControls()}
            showSuggested={false}
            suggestions={undefined}
            shiftX={() => undefined}
          />
        ))}
      </CanvasZoomProvider>,
    );

  it('sits over the notes, centred on the shape, and grows as the board zooms out', () => {
    drawAt(1);
    const near = plate();
    // The notes span 0..500 by 480..680: the plate is centred on (250, 580).
    expect(
      parseFloat(near.style.left) + parseFloat(near.style.width || '0') / 2,
    ).toBeLessThanOrEqual(250);
    expect(parseFloat(near.style.top) + parseFloat(near.style.height) / 2).toBe(580);
    const nearPx = parseFloat(near.style.fontSize);
    cleanup();
    drawAt(0.5);
    expect(parseFloat(plate().style.fontSize)).toBeGreaterThan(nearPx);
  });

  it('selects from the line again when the name already has focus', () => {
    drawAt(1);
    const name = screen.getByRole('button', { name: 'Candidate context: Ctx k' });
    name.focus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(outline('k')!.getAttribute('stroke-dasharray')).toBe('10 10');
    fireEvent.click(document.querySelector('[data-context-line="k"]')!);
    expect(outline('k')!.getAttribute('stroke-dasharray')).toBeNull();
  });
});

describe('ContextLayer: Draw Context’s pen (candidate-contexts.md "Making one by hand")', () => {
  const pen = () => document.querySelector<HTMLElement>('[data-context-pen]');
  // jsdom lays nothing out: the sheet's box is placed by hand, so a client point maps to a canvas point.
  const placeSheet = () => {
    const sheet = pen()!;
    sheet.getBoundingClientRect = () =>
      ({ left: -1_000_000, top: -1_000_000, width: 0, height: 0 }) as DOMRect;
    return sheet;
  };
  const drawLoop = (sheet: HTMLElement, points: [number, number][]) => {
    const [first, ...rest] = points;
    fireEvent.pointerDown(sheet, { clientX: first![0], clientY: first![1], pointerId: 1 });
    for (const [x, y] of rest)
      fireEvent.pointerMove(sheet, { clientX: x, clientY: y, pointerId: 1 });
    fireEvent.pointerUp(sheet, { pointerId: 1 });
  };

  it('is armed by the store even on a board with no contexts, and makes one round the notes in the loop', () => {
    const c = contextControls();
    draw([note('a', 0), note('b', 300), note('c', 2000)], { contexts: c });
    expect(pen()).toBeNull();
    act(() => setDrawingContext(TAB, true));
    const sheet = placeSheet();
    drawLoop(sheet, [
      [-20, 460],
      [300, 450],
      [600, 460],
      [600, 1],
      [600, 700],
      [-20, 700],
    ]);
    expect(c.create).toHaveBeenCalledWith(['a', 'b'], 'drawn');
    // The new one's name opens, and the pen is put away.
    expect(pen()).toBeNull();
  });

  it('puts the pen away when the loop takes in no note, and moves without a press draw nothing', () => {
    const c = { ...contextControls(), create: vi.fn(() => null) };
    draw(board, { contexts: c });
    act(() => setDrawingContext(TAB, true));
    const sheet = placeSheet();
    fireEvent.pointerMove(sheet, { clientX: 5, clientY: 5 });
    fireEvent.pointerUp(sheet);
    expect(c.create).not.toHaveBeenCalled();
    drawLoop(sheet, [
      [5000, 5000],
      [5001, 5001],
      [5100, 5000],
    ]);
    expect(c.create).toHaveBeenCalledWith([], 'drawn');
    expect(pen()).toBeNull();
  });

  it('offers no pen to someone who may not change contexts', () => {
    draw(board);
    act(() => setDrawingContext(TAB, true));
    expect(pen()).toBeNull();
  });
});
