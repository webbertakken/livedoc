// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { laneActionSpies } from '@/hooks/canvas/lane-actions.fixture';
import {
  ES_NOTE_GAP,
  type Element,
  type EsNoteChange,
  type StickyElement,
} from '@livedoc/document';
import { CanvasZoomProvider } from '@/components/canvas/CanvasZoomContext';
import type { SuggestionControls } from '@/components/canvas/Canvas.types';
import {
  KIND,
  REMOVE,
  REWORD,
  SPLIT,
  STEP,
  byId,
  changed,
  named,
  orderFlow,
} from '@/lib/change-board.fixture';
import { askViewFor, openAsk, resetAskViewForTests } from '@/lib/ask-view';
import { offeredPreview } from '@/lib/change-preview';
import { suggestionPreview } from '@/lib/suggestion-apply';
import {
  SUGGESTION_PREVIEW_LEAVE_MS,
  changeKey,
  contextsKey,
  endSuggestionPreview,
  setShowAllSuggestions,
  setSuggestionsPanelOpen,
  suggestionViewFor,
} from '@/lib/suggestion-view';
import { changeMarkPlace, changeMarkWords } from './NoteChangeMark';
import { PEEK_PROTRUDE, PEEK_PROTRUDE_ACROSS } from './SuggestionPeekTab';
import { SuggestionLayer } from './SuggestionLayer';

// The suggestions on the canvas (docs/specs/021-event-storming/suggestions.md "How a person sees them"): peek tabs,
// the preview, the keys, Show All and the panel.

const track = vi.fn<typeof import('@/lib/telemetry').track>();
vi.mock('@/lib/telemetry', () => ({ track: (...a: Parameters<typeof track>) => track(...a) }));

const TAB = 'tab-1';

function note(id: string, kind: string, x: number, y = 480): StickyElement {
  return {
    id,
    type: 'sticky',
    esKind: kind,
    fixedSize: true,
    label: id,
    x,
    y,
    width: 200,
    height: 200,
  } as StickyElement;
}

const suggestion = (
  id: string,
  kind: string,
  anchorId: string,
  side: 'before' | 'after' | 'above' | 'below',
  extra: object = {},
): StickyElement => ({
  ...note(id, kind, -9000, 0),
  label: `words ${id}`,
  esSuggestion: {
    anchorId,
    side,
    reason: `because ${id}`,
    by: 'Claude',
    gap: 'event_without_cause',
    ...extra,
  },
});

const event = note('e', 'domain-event', 1000);
const board: Element[] = [
  event,
  suggestion('c', 'command', 'e', 'before'),
  suggestion('a', 'actor', 'c', 'above'),
  suggestion('p', 'policy', 'e', 'after'),
  suggestion('r', 'read-model', 'e', 'below', { by: undefined }),
];

function controls(): SuggestionControls {
  return {
    ...laneActionSpies(),
    apply: vi.fn(),
    dismiss: vi.fn(),
    applyAll: vi.fn(),
    dismissAll: vi.fn(),
    chooseName: vi.fn(),
    dismissNames: vi.fn(),
    acceptChange: vi.fn(),
    dismissChange: vi.fn(),
    reveal: vi.fn(),
  };
}

function draw(elements: Element[], c = controls(), showAll = false) {
  render(
    <CanvasZoomProvider zoom={1}>
      <SuggestionLayer
        elements={elements}
        tabId={TAB}
        controls={c}
        showAllSpots={showAll ? suggestionPreview(elements).spots : null}
      />
    </CanvasZoomProvider>,
  );
  return c;
}

// The layer with what the canvas hands it beside the board: the previewed change, the inert notes, the selecting.
function drawWith(
  elements: Element[],
  extra: Partial<Parameters<typeof SuggestionLayer>[0]>,
  c = controls(),
) {
  const view = render(
    <CanvasZoomProvider zoom={1}>
      <SuggestionLayer
        elements={elements}
        tabId={TAB}
        controls={c}
        showAllSpots={null}
        {...extra}
      />
    </CanvasZoomProvider>,
  );
  return { controls: c, unmount: view.unmount };
}

const hint = (key: string) =>
  document.querySelector<HTMLElement>(`[data-suggestion-hint="${key}"]`)!;
const placeholders = () =>
  [...document.querySelectorAll<HTMLElement>('[data-suggestion-placeholder]')].map(
    (el) => el.dataset.suggestionPlaceholder,
  );

beforeEach(() => {
  vi.useFakeTimers();
  track.mockClear();
});
afterEach(() => {
  cleanup();
  act(() => {
    endSuggestionPreview(TAB);
    setShowAllSuggestions(TAB, false);
    setSuggestionsPanelOpen(TAB, false);
  });
  vi.useRealTimers();
});

describe('SuggestionLayer with Show All off', () => {
  it('shows nothing on a board without suggestions', () => {
    draw([event]);
    expect(document.body.textContent).toBe('');
  });

  it('shows one peek tab per anchor side, named for what it holds', () => {
    draw(board);
    expect(
      screen.getByRole('button', {
        name: 'Suggested before this domain event: Command “words c” and 1 more',
      }),
    ).toBe(hint('e:before'));
    expect(hint('e:after').getAttribute('aria-label')).toBe(
      'Suggested after this domain event: Policy “words p”',
    );
    expect(hint('e:before').textContent).toBe('2');
    expect(hint('e:after').textContent).toBe('');
    expect(placeholders()).toEqual([]);
  });

  it('tucks each tab against the anchor on its side, beside the note within the gutter', () => {
    draw(board);
    const peek = (side: string) =>
      document.querySelector<HTMLElement>(`[data-suggestion-peek="${side}"]`)!.style;
    expect(peek('before').width).toBe(`${PEEK_PROTRUDE}px`);
    expect(PEEK_PROTRUDE).toBeLessThan(ES_NOTE_GAP);
    expect(peek('before').borderRightWidth).toBe('0px');
    expect(peek('after').borderLeftWidth).toBe('0px');
    expect(peek('below').height).toBe(`${PEEK_PROTRUDE_ACROSS}px`);
    expect(peek('below').borderTopWidth).toBe('0px');
  });

  it('previews the whole chain on hover, with the reason and who, never the gap code', () => {
    draw(board);
    fireEvent.pointerEnter(hint('e:before'));
    expect(placeholders()).toEqual(['c', 'a']);
    const caption = document.querySelector('[data-suggestion-caption]')!;
    expect(caption.textContent).toBe('because cSuggested by Claude');
    // Crossing from the tab to its preview keeps it open.
    fireEvent.pointerLeave(hint('e:before'));
    fireEvent.pointerEnter(screen.getByRole('group', { name: 'Suggestion: Command “words c”' }));
    act(() => {
      vi.advanceTimersByTime(SUGGESTION_PREVIEW_LEAVE_MS * 2);
    });
    expect(placeholders()).toEqual(['c', 'a']);
    fireEvent.pointerLeave(screen.getByRole('group', { name: 'Suggestion: Command “words c”' }));
    act(() => {
      vi.advanceTimersByTime(SUGGESTION_PREVIEW_LEAVE_MS);
    });
    expect(placeholders()).toEqual([]);
  });

  it('captions a reason with no author without a "Suggested by" line', () => {
    draw(board);
    fireEvent.focus(hint('e:below'));
    expect(document.querySelector('[data-suggestion-caption]')!.textContent).toBe('because r');
  });

  it('shows a click on a tab as a preview, for a touch without hover', () => {
    const c = draw(board);
    fireEvent.click(hint('e:after'));
    expect(placeholders()).toEqual(['p']);
    expect(c.apply).not.toHaveBeenCalled();
  });

  it('applies with Enter and dismisses with Delete or Backspace, the first in the chain', () => {
    const c = draw(board);
    fireEvent.keyDown(hint('e:before'), { key: 'Enter' });
    expect(c.apply).toHaveBeenCalledWith('c');
    fireEvent.keyDown(hint('e:before'), { key: 'Delete' });
    fireEvent.keyDown(hint('e:after'), { key: 'Backspace' });
    expect(vi.mocked(c.dismiss).mock.calls).toEqual([['c'], ['p']]);
    fireEvent.keyDown(hint('e:after'), { key: 'a' });
    expect(c.apply).toHaveBeenCalledTimes(1);
  });

  it('acts from the preview’s ✓ and ✕ and the placeholder’s keys', () => {
    const c = draw(board);
    fireEvent.pointerEnter(hint('e:after'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply suggestion: Policy “words p”' }));
    expect(c.apply).toHaveBeenCalledWith('p');
    expect(placeholders()).toEqual([]);
    fireEvent.pointerEnter(hint('e:after'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss suggestion: Policy “words p”' }));
    expect(c.dismiss).toHaveBeenCalledWith('p');
    fireEvent.pointerEnter(hint('e:after'));
    fireEvent.keyDown(screen.getByRole('group', { name: 'Suggestion: Policy “words p”' }), {
      key: 'Enter',
    });
    expect(c.apply).toHaveBeenCalledTimes(2);
  });
});

describe('SuggestionLayer edges', () => {
  const bare = suggestion('u', 'actor', 'e', 'above', { reason: undefined, by: undefined });

  it('keeps its pointer presses from the canvas beneath', () => {
    const outer = vi.fn();
    render(
      <div onPointerDown={outer}>
        <CanvasZoomProvider zoom={2}>
          <SuggestionLayer
            elements={[event, bare]}
            tabId={TAB}
            controls={controls()}
            showAllSpots={null}
          />
        </CanvasZoomProvider>
      </div>,
    );
    fireEvent.pointerDown(hint('e:above'));
    fireEvent.focus(hint('e:above'));
    fireEvent.pointerDown(screen.getByRole('group', { name: 'Suggestion: Actor “words u”' }));
    expect(outer).not.toHaveBeenCalled();
    // No reason and no author: no caption at all.
    expect(document.querySelector('[data-suggestion-caption]')).toBeNull();
    expect(
      document.querySelector<HTMLElement>('[data-suggestion-peek="above"]')!.style
        .borderBottomWidth,
    ).toBe('0px');
  });

  it('lists a suggestion without a reason as its words alone', () => {
    act(() => setSuggestionsPanelOpen(TAB, true));
    draw([event, bare]);
    expect(document.querySelector('[data-suggestion-row="u"]')!.textContent).toBe('Actor words u');
  });

  it('draws no placeholder for a suggestion Show All has no spot for', () => {
    act(() => setShowAllSuggestions(TAB, true));
    render(
      <CanvasZoomProvider zoom={1}>
        <SuggestionLayer
          elements={[event, bare]}
          tabId={TAB}
          controls={controls()}
          showAllSpots={new Map()}
        />
      </CanvasZoomProvider>,
    );
    expect(placeholders()).toEqual([]);
  });
});

describe('SuggestionLayer with Show All on', () => {
  it('draws every placeholder where Apply All lands it, its caption on hover', () => {
    act(() => setShowAllSuggestions(TAB, true));
    draw(board, controls(), true);
    expect(placeholders().sort()).toEqual(['a', 'c', 'p', 'r']);
    expect(document.querySelector('[data-suggestion-hint]')).toBeNull();
    fireEvent.pointerEnter(screen.getByRole('group', { name: 'Suggestion: Policy “words p”' }));
    expect(document.querySelector('[data-suggestion-caption]')!.textContent).toContain('because p');
  });

  it('falls back to peek tabs while the preview is put away', () => {
    act(() => setShowAllSuggestions(TAB, true));
    draw(board, controls(), false);
    expect(hint('e:before')).not.toBeNull();
  });

  it('keeps the focus on its switch as the board turns to the preview and back', () => {
    const layer = (showAll: boolean) => (
      <CanvasZoomProvider zoom={1}>
        <SuggestionLayer
          elements={board}
          tabId={TAB}
          controls={controls()}
          showAllSpots={showAll ? suggestionPreview(board).spots : null}
        />
      </CanvasZoomProvider>
    );
    act(() => setSuggestionsPanelOpen(TAB, true));
    const { rerender } = render(layer(false));
    const show = screen.getByRole('switch', { name: 'Show All Suggestions' });
    show.focus();
    fireEvent.click(show);
    rerender(layer(true));
    expect(placeholders().sort()).toEqual(['a', 'c', 'p', 'r']);
    expect(document.activeElement).toBe(show);
    fireEvent.click(show);
    rerender(layer(false));
    expect(hint('e:before')).not.toBeNull();
    expect(document.activeElement).toBe(show);
  });
});

describe('the suggestions panel', () => {
  const panel = () => screen.getByRole('complementary', { name: 'Suggestions' });

  it('opens collapsed, saying how many', () => {
    draw(board);
    const toggle = within(panel()).getByRole('button', { name: '4 suggestions' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(panel()).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('says one suggestion in the singular', () => {
    draw([event, suggestion('p', 'policy', 'e', 'after')]);
    expect(within(panel()).getByRole('button', { name: '1 suggestion' })).toBeTruthy();
  });

  it('lists every suggestion in timeline order when expanded', () => {
    draw(board);
    fireEvent.click(within(panel()).getByRole('button', { name: '4 suggestions' }));
    const rows = within(panel()).getAllByRole('listitem');
    expect(rows.map((r) => r.dataset.suggestionRow)).toEqual(['a', 'c', 'r', 'p']);
    expect(
      within(panel()).getByRole('button', { name: '4 suggestions' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('brings a row into view and previews just it', () => {
    const c = draw(board);
    act(() => setSuggestionsPanelOpen(TAB, true));
    const row = document.querySelector<HTMLElement>('[data-suggestion-row="a"]')!;
    fireEvent.pointerEnter(row);
    expect(placeholders()).toEqual(['a']);
    expect(c.reveal).toHaveBeenCalledTimes(1);
    const shown = vi.mocked(c.reveal).mock.calls[0]![0];
    // The rect holds the anchor (the command's spot) and the actor's spot above it.
    expect(shown.height).toBeGreaterThan(200);
    fireEvent.pointerLeave(row);
    act(() => {
      vi.advanceTimersByTime(SUGGESTION_PREVIEW_LEAVE_MS);
    });
    expect(placeholders()).toEqual([]);
    fireEvent.focus(row);
    expect(placeholders()).toEqual(['a']);
    fireEvent.blur(row);
  });

  it('applies, dismisses, applies all and dismisses all from the panel', () => {
    const c = draw(board);
    act(() => setSuggestionsPanelOpen(TAB, true));
    fireEvent.click(screen.getByRole('button', { name: 'Apply suggestion: Read model “words r”' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss suggestion: Read model “words r”' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss All' }));
    expect(c.apply).toHaveBeenCalledWith('r');
    expect(c.dismiss).toHaveBeenCalledWith('r');
    expect(c.applyAll).toHaveBeenCalledTimes(1);
    expect(c.dismissAll).toHaveBeenCalledTimes(1);
  });

  it('switches Show All, counting it when it goes on', () => {
    draw(board);
    act(() => setSuggestionsPanelOpen(TAB, true));
    const show = screen.getByRole('switch', { name: 'Show All Suggestions' });
    fireEvent.click(show);
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'SuggestionsShown');
    expect(show.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(show);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('opens the panel’s rows at their Show All spots when Show All is on', () => {
    act(() => {
      setShowAllSuggestions(TAB, true);
      setSuggestionsPanelOpen(TAB, true);
    });
    const c = draw(
      [note('a0', 'domain-event', 1000 - 216), event, suggestion('c', 'command', 'e', 'before')],
      controls(),
      true,
    );
    fireEvent.pointerEnter(document.querySelector<HTMLElement>('[data-suggestion-row="c"]')!);
    // Apply All lands the command where the event stands, the event making room.
    expect(vi.mocked(c.reveal).mock.calls[0]![0]).toMatchObject({ x: 1000 });
  });
});

// Suggested candidate contexts in the panel (docs/specs/021-event-storming/candidate-contexts.md "How a person sees
// and decides").
describe('SuggestionLayer: suggested contexts', () => {
  const panel = () => screen.getByRole('complementary', { name: 'Suggestions' });
  const context = (id: string, notes: string[], suggested = true): Element => ({
    id,
    type: 'shape',
    shape: 'square',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    label: `Context ${id}`,
    esContext: { notes, ...(suggested ? { suggestion: { reason: `because ${id}` } } : {}) },
  });
  const left = note('l', 'domain-event', 200);

  it('lists a suggested context among the notes, at its leftmost note, with its size and reason', () => {
    const c = draw([...board, left, context('ctx', ['l', 'e']), context('kept', ['e'], false)]);
    act(() => setSuggestionsPanelOpen(TAB, true));
    const rows = within(panel()).getAllByRole('listitem');
    expect(rows.map((r) => r.dataset.suggestionRow)).toEqual(['ctx', 'a', 'c', 'r', 'p']);
    expect(rows[0]!.textContent).toContain('Context ctx · 2 notes');
    expect(rows[0]!.textContent).toContain('because ctx');
    fireEvent.pointerEnter(rows[0]!);
    expect(vi.mocked(c.reveal).mock.calls[0]![0]).toMatchObject({ x: 200, width: 1000 });
    fireEvent.pointerLeave(rows[0]!);
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply suggestion: Candidate context: Context ctx' }),
    );
    expect(c.apply).toHaveBeenCalledWith('ctx');
  });

  it('shows the panel for a board whose only suggestions are contexts, never an orphan', () => {
    draw([left, context('ctx', ['l']), context('orphan', ['gone'])]);
    expect(within(panel()).getByRole('button', { name: '1 suggestion' })).toBeTruthy();
    act(() => setSuggestionsPanelOpen(TAB, true));
    expect(within(panel()).getByText('1 note', { exact: false })).toBeTruthy();
  });
});

// Changes suggested to notes already on the board (docs/specs/021-event-storming/suggested-changes.md "How a person
// sees and decides").
describe('SuggestionLayer: note changes', () => {
  const flow = () => changed(changed(orderFlow(), 'pack', REWORD), 'packed', SPLIT, REMOVE);
  const mark = (id: string) => document.querySelector<HTMLElement>(`[data-change-mark="${id}"]`)!;
  const caption = () => document.querySelector<HTMLElement>('[data-change-caption]');

  it('marks each note that holds changes with the word for its first, and how many more', () => {
    draw(flow());
    expect(mark('pack').getAttribute('aria-label')).toBe(
      'Suggested change to this command: Reword “Pack parcel”',
    );
    expect(mark('pack').textContent).toBe('Reword');
    expect(mark('packed').getAttribute('aria-label')).toBe(
      'Suggested change to this domain event: Split “Order packed” · “Order shipped” and 1 more',
    );
    expect(mark('packed').textContent).toBe('Split +1');
    expect(document.querySelectorAll('[data-change-mark]')).toHaveLength(2);
  });

  it('words each change: a kind change says the kind the note would become', () => {
    const words = (...changes: EsNoteChange[]) => changeMarkWords({ changes });
    expect(words(REWORD)).toBe('Reword');
    expect(words(SPLIT)).toBe('Split');
    expect(words(REMOVE, REWORD, SPLIT)).toBe('Remove +2');
    expect(words(KIND)).toBe('To Command');
    expect(words({ change: 'kind', kind: 'domain-event' }, REMOVE)).toBe('To Domain Event +1');
  });

  it('stands the mark on the note’s top edge, its right end set in from the corner', () => {
    const pack = byId(flow(), 'pack');
    expect(changeMarkPlace(pack, false)).toEqual({
      right: pack.x + 200 - 8,
      top: pack.y - 20,
      height: 20,
      maxWidth: 200 - 16,
    });
  });

  it('keeps the mark clear of a peek tab standing above the note', () => {
    const pack = byId(flow(), 'pack');
    // The peek tab is centred on the top edge, 48 long: the mark has what is left of the right half, less a gap.
    expect(changeMarkPlace(pack, true).maxWidth).toBe(192 - 124 - 4);
    draw([...flow(), suggestion('above-pack', 'actor', 'pack', 'above')]);
    expect(mark('pack').style.maxWidth).toBe('64px');
    expect(mark('packed').style.maxWidth).toBe('184px');
  });

  it('captions the previewed change: what changes, why, how far it reaches and who', () => {
    draw(flow());
    expect(caption()).toBeNull();
    fireEvent.pointerEnter(mark('pack'));
    const text = caption()!.textContent;
    expect(text).toContain('Reword');
    expect(text).toContain('“Pack parcel”');
    expect(text).toContain('The warehouse handles a parcel.');
    expect(text).toContain('Also rewords 2 notes in Fulfilment · 3 more on the board');
    expect(text).toContain('Suggested by Claude');
    // The preview outlives the pointer for a beat, so it can cross to the caption.
    fireEvent.pointerLeave(mark('pack'));
    expect(caption()).not.toBeNull();
    act(() => void vi.advanceTimersByTime(SUGGESTION_PREVIEW_LEAVE_MS + 1));
    expect(caption()).toBeNull();
  });

  it('accepts, accepts everywhere and dismisses from the caption', () => {
    const c = draw(flow());
    const open = () => fireEvent.focus(mark('pack'));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Accept: Reword “Pack parcel”' }));
    expect(c.acceptChange).toHaveBeenLastCalledWith('pack', REWORD);
    expect(caption()).toBeNull();
    open();
    fireEvent.click(
      screen.getByRole('button', { name: 'Accept everywhere: Reword “Pack parcel”' }),
    );
    expect(c.acceptChange).toHaveBeenLastCalledWith('pack', REWORD, 'board');
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: Reword “Pack parcel”' }));
    expect(c.dismissChange).toHaveBeenCalledWith('pack', REWORD);
  });

  it('offers Everywhere only for a reword that notes beyond its context hold', () => {
    draw(flow());
    fireEvent.focus(mark('packed'));
    expect(caption()!.textContent).toContain('Split');
    expect(screen.queryByRole('button', { name: /^Accept everywhere/ })).toBeNull();
  });

  it('previews the reword across the board while Everywhere is pointed at', () => {
    draw(flow());
    fireEvent.focus(mark('pack'));
    const everywhere = screen.getByRole('button', { name: /^Accept everywhere/ });
    fireEvent.pointerEnter(everywhere);
    expect(suggestionViewFor(TAB).previewKey).toBe(changeKey('pack', 0, 'board'));
    fireEvent.pointerLeave(everywhere);
    expect(suggestionViewFor(TAB).previewKey).toBe(changeKey('pack', 0));
  });

  it('accepts the first change with Enter and dismisses it with Delete', () => {
    const c = draw(flow());
    fireEvent.keyDown(mark('packed'), { key: 'Enter' });
    expect(c.acceptChange).toHaveBeenCalledWith('packed', SPLIT);
    fireEvent.keyDown(mark('packed'), { key: 'Delete' });
    expect(c.dismissChange).toHaveBeenCalledWith('packed', SPLIT);
  });

  it('draws a previewed split’s further parts where they would land, and strikes a note to be removed', () => {
    const board = flow();
    const split = offeredPreview(board, changeKey('packed', 0), new Set())!;
    const { unmount } = drawWith(board, { offered: split });
    const part = document.querySelector<HTMLElement>('[data-change-part="Order shipped"]')!;
    expect(part.style.left).toBe(`${byId(board, 'packed').x + STEP}px`);
    expect(part.textContent).toContain('Order shipped');
    expect(document.querySelector('[data-change-strike]')).toBeNull();
    unmount();
    drawWith(board, { offered: offeredPreview(board, changeKey('packed', 1), new Set())! });
    expect(document.querySelector('[data-change-strike="packed"]')).not.toBeNull();
    expect(document.querySelector('[data-change-part]')).toBeNull();
  });

  it('wears no mark on a note on a hidden or locked layer', () => {
    drawWith(flow(), { inertIds: new Set(['pack']) });
    expect(document.querySelector('[data-change-mark="pack"]')).toBeNull();
    expect(document.querySelector('[data-change-mark="packed"]')).not.toBeNull();
  });
});

describe('the suggestions panel: suggested changes', () => {
  const panel = () => screen.getByRole('complementary', { name: 'Suggestions' });
  const open = (n: number) =>
    fireEvent.click(within(panel()).getByRole('button', { name: `${n} suggestions` }));
  const flow = () =>
    changed(
      named(
        named(orderFlow(), ['ordering'], 'Order taking', 'Sales'),
        ['ordering', 'fulfilment'],
        'Shop',
      ),
      'pack',
      REWORD,
      KIND,
    );

  it('lists a board that holds only suggested changes, along the timeline', () => {
    draw(flow());
    open(4);
    expect(
      within(panel())
        .getAllByRole('listitem')
        .map((r) => r.dataset.suggestionRow),
    ).toEqual(['names:ordering', 'merge:fulfilment ordering', 'change:pack:0', 'change:pack:1']);
  });

  it('says what each row is: the names for a context or a merge, and a change with its reason', () => {
    draw(flow());
    open(4);
    const rows = within(panel()).getAllByRole('listitem');
    expect(rows[0]!.textContent).toBe('Names OrderingOrder taking, Sales');
    expect(rows[1]!.textContent).toBe('Merge Ordering + FulfilmentShop');
    expect(rows[2]!.textContent).toBe(
      'Reword “Pack parcel”The warehouse handles a parcel.Everywhere',
    );
    expect(rows[3]!.textContent).toBe('Change kind CommandIt asks.');
  });

  it('accepts a change, in its context or everywhere, and dismisses it', () => {
    const c = draw(flow());
    open(4);
    fireEvent.click(screen.getByRole('button', { name: 'Apply suggestion: Reword “Pack parcel”' }));
    expect(c.acceptChange).toHaveBeenLastCalledWith('pack', REWORD, 'context');
    fireEvent.click(screen.getByRole('button', { name: 'Apply everywhere: Reword “Pack parcel”' }));
    expect(c.acceptChange).toHaveBeenLastCalledWith('pack', REWORD, 'board');
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss suggestion: Change kind Command' }),
    );
    expect(c.dismissChange).toHaveBeenCalledWith('pack', KIND);
  });

  it('previews a change row as its mark does, and brings its note into view', () => {
    const c = draw(flow());
    open(4);
    fireEvent.pointerEnter(within(panel()).getAllByRole('listitem')[3]!);
    expect(suggestionViewFor(TAB).previewKey).toBe(changeKey('pack', 1));
    expect(c.reveal).toHaveBeenLastCalledWith(expect.objectContaining({ x: 5 * STEP, width: 200 }));
    expect(document.querySelector('[data-change-caption]')!.textContent).toContain('Change kind');
  });

  it('selects a Names or a Merge row’s contexts when it is chosen, and dismisses its names with ✕', () => {
    const onSelectContexts = vi.fn();
    const c = drawWith(flow(), { onSelectContexts }).controls;
    open(4);
    fireEvent.click(screen.getByRole('button', { name: 'Show name suggestions for Ordering' }));
    expect(onSelectContexts).toHaveBeenLastCalledWith(['ordering']);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Show name suggestions for Ordering and Fulfilment merged',
      }),
    );
    expect(onSelectContexts).toHaveBeenLastCalledWith(['ordering', 'fulfilment']);
    expect(screen.queryByRole('button', { name: /^Apply suggestion: Name/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss name suggestions for Ordering' }));
    expect(c.dismissNames).toHaveBeenLastCalledWith(['ordering']);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Dismiss name suggestions for Ordering and Fulfilment merged',
      }),
    );
    expect(c.dismissNames).toHaveBeenLastCalledWith(['ordering', 'fulfilment']);
  });

  it('brings a Names row’s contexts forward while it is pointed at', () => {
    draw(flow());
    open(4);
    fireEvent.pointerEnter(within(panel()).getAllByRole('listitem')[1]!);
    expect(suggestionViewFor(TAB).previewKey).toBe(contextsKey(['ordering', 'fulfilment']));
  });
});

// The Ask pill's corner (docs/specs/021-event-storming/asks.md "Where an ask starts", ruled 2026-11-15: "Beside the
// suggestions"): the corner shows for whoever may ask, with or without a suggestion, and the list and the Ask
// popover never stand open together.
describe('SuggestionLayer: the Ask pill', () => {
  beforeEach(resetAskViewForTests);
  const plain = () => [note('placed', 'domain-event', 216)];
  const layer = (elements: Element[], canAsk: boolean, controls = laneActionSpies()) => {
    const all = { ...controls, reveal: vi.fn() } as unknown as SuggestionControls;
    render(
      <SuggestionLayer
        elements={elements}
        tabId={TAB}
        controls={all}
        showAllSpots={null}
        canAsk={canAsk}
      />,
    );
    return controls;
  };

  it('stands alone in the corner on a board with no suggestion, and opens an ask', () => {
    const controls = layer(plain(), true);
    const corner = screen.getByTestId('suggestions-panel');
    const pill = within(corner).getByRole('button', { name: 'Ask' });
    expect(within(corner).getAllByRole('button')).toEqual([pill]);
    fireEvent.click(pill);
    expect(controls.openAsk).toHaveBeenCalledWith();
    expect(askViewFor(TAB).anchor).not.toBeNull();
  });

  it('shows no corner to someone who may not ask, on a board with no suggestion', () => {
    layer(plain(), false);
    expect(screen.queryByTestId('suggestions-panel')).toBeNull();
  });

  it('closes the Ask popover when the list opens, and closes instead of opening again', () => {
    const controls = layer([...plain(), suggestion('paid', 'domain-event', 'placed', 'after')], true);
    const corner = screen.getByTestId('suggestions-panel');
    act(() => openAsk(TAB, { type: 'board' }));
    fireEvent.click(within(corner).getByRole('button', { name: '1 suggestion' }));
    expect(askViewFor(TAB).open).toBe(false);
    act(() => openAsk(TAB, { type: 'board' }));
    const pill = within(corner).getByRole('button', { name: 'Ask' });
    expect(pill.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(pill);
    expect(askViewFor(TAB).open).toBe(false);
    expect(controls.openAsk).not.toHaveBeenCalled();
  });
});
