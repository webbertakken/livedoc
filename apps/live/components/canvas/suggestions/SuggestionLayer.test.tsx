// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ES_NOTE_GAP, type Element, type StickyElement } from '@livedoc/document';
import { CanvasZoomProvider } from '@/components/canvas/CanvasZoomContext';
import type { SuggestionControls } from '@/components/canvas/Canvas.types';
import { suggestionPreview } from '@/lib/suggestion-apply';
import {
  SUGGESTION_PREVIEW_LEAVE_MS,
  endSuggestionPreview,
  setShowAllSuggestions,
  setSuggestionsPanelOpen,
} from '@/lib/suggestion-view';
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
    apply: vi.fn(),
    dismiss: vi.fn(),
    applyAll: vi.fn(),
    dismissAll: vi.fn(),
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
