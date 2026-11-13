// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CandidateContextElement, Element } from '@livedoc/document';
import { CanvasZoomProvider } from '@/components/canvas/CanvasZoomContext';
import type { ContextControls, SuggestionControls } from '@/components/canvas/Canvas.types';
import { clearLocalPreview, setLocalPreview } from '@/lib/drag-preview';
import { endSuggestionPreview, previewSuggestion } from '@/lib/suggestion-view';
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
  [...document.querySelectorAll<HTMLElement>('[data-candidate-context]')].map(
    (el) => el.dataset.candidateContext,
  );

afterEach(() => {
  cleanup();
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
    expect(container.querySelector('[data-testid="context-layer"]')).toBeNull();
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
    fireEvent.blur(name);
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
    fireEvent.doubleClick(name);
    expect(screen.queryByRole('textbox')).toBeNull();
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
