// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renameTerm, type Element, type Tab } from '@livedoc/document';
import { readBoard } from '@livedoc/storm-reading';
import { REVIEW_BOARD_IDS as IDS, reviewBoardElements } from '@/lib/review-board.fixture';
import type { ReviewTab } from '@/lib/review-view';
import { heldEscapeLayers, resetEscapeLayersForTests } from '@/hooks/ui/useEscapeLayer';
import { ReviewPanel, type ReviewPanelActs } from './ReviewPanel';

// The Review panel's three tabs on the seeded kitchen (docs/specs/021-event-storming/board-review.md, board-language.md
// "The Language tab").
afterEach(cleanup);

const read = (elements: Element[] = reviewBoardElements()) =>
  readBoard({ id: 't', name: 'Kitchen', kind: 'event-storming', elements } as Tab);

function open(
  tab: ReviewTab,
  { mayWrite = true, elements = reviewBoardElements(), withBoard = false } = {},
) {
  const acts = {
    ring: vi.fn<ReviewPanelActs['ring']>(),
    add: vi.fn<ReviewPanelActs['add']>(),
    answer: vi.fn<ReviewPanelActs['answer']>(),
    previewRename: vi.fn<ReviewPanelActs['previewRename']>(),
    renameWouldChange: vi.fn<ReviewPanelActs['renameWouldChange']>(
      ({ from, to }) => to !== '' && to !== from,
    ),
    rename: vi.fn<ReviewPanelActs['rename']>(),
    storyWalked: vi.fn<ReviewPanelActs['storyWalked']>(),
  };
  const onTab = vi.fn<(tab: ReviewTab) => void>();
  // Inside the panel, as ReviewHost draws it: the panel's own keys take an Escape pressed in it.
  render(
    <>
      <aside data-review-panel="">
        <ReviewPanel
          tab={tab}
          reading={read(elements)}
          mayWrite={mayWrite}
          onTab={onTab}
          acts={acts}
        />
      </aside>
      {withBoard ? (
        <main tabIndex={-1} aria-label="Canvas">
          <input aria-label="A label" />
          <div role="menu" aria-label="Element menu" data-menu-surface="">
            <button type="button" role="menuitem">
              Copy
            </button>
          </div>
        </main>
      ) : null}
    </>,
  );
  return { acts, onTab };
}

const lastRing = (acts: { ring: ReturnType<typeof vi.fn> }) => acts.ring.mock.calls.at(-1);

describe('the Review panel’s tabs', () => {
  it('follows the tabs pattern: one tab in the tab order, its panel labelled by it', () => {
    open('check');
    const tabs = screen.getAllByRole<HTMLButtonElement>('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Check', 'Language', 'Story']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(tabs[0]!.id);
  });

  it('moves between the tabs with the arrow keys, Home and End, wrapping at the ends', () => {
    const { onTab } = open('check');
    const list = screen.getByRole('tablist', { name: 'Review' });
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    fireEvent.keyDown(list, { key: 'End' });
    fireEvent.keyDown(list, { key: 'Home' });
    fireEvent.keyDown(list, { key: 'a' });
    expect(onTab.mock.calls.map(([t]) => t)).toEqual(['language', 'story', 'story', 'check']);
    fireEvent.click(screen.getByRole('tab', { name: 'Story' }));
    expect(onTab).toHaveBeenLastCalledWith('story');
  });
});

describe('Check', () => {
  it('heads with the readiness line, then the gaps by level', () => {
    open('check');
    expect(screen.getByRole('status').textContent).toBe(
      '5 events · 3 gaps · 1 open hotspot · 3 events outside a context',
    );
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'The story has a hole',
      'The grammar slipped',
      'Left open',
    ]);
  });

  it('rings a row’s notes while it is pointed at or focused, and lets go after', () => {
    const { acts } = open('check');
    const row = screen
      .getByText('Table cleared', { selector: '[data-review-gap="event_without_cause"] *' })
      .closest('li')!;
    fireEvent.pointerEnter(row);
    expect(lastRing(acts)).toEqual([[IDS.tableCleared]]);
    fireEvent.pointerLeave(row);
    expect(lastRing(acts)).toEqual([[]]);
    fireEvent.focus(row);
    expect(lastRing(acts)).toEqual([[IDS.tableCleared]]);
    fireEvent.blur(row);
    expect(lastRing(acts)).toEqual([[]]);
  });

  it('adds the note a gap’s remedy names, and answers an open hotspot', () => {
    const { acts } = open('check');
    fireEvent.click(screen.getByRole('button', { name: 'Add a command before Table cleared' }));
    expect(acts.add.mock.calls[0]![0]).toMatchObject({
      code: 'event_without_cause',
      ids: [IDS.tableCleared],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Answer: What if an order is sent back?' }));
    expect(acts.answer).toHaveBeenCalledWith(IDS.sentBack);
  });

  it('offers no Add and no Answer to whoever may not write', () => {
    open('check', { mayWrite: false });
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Answer/ })).toBeNull();
    expect(
      screen.getByText('Table cleared', { selector: '[data-review-gap="event_without_cause"] *' }),
    ).toBeTruthy();
  });

  it('says the story holds when the reading finds no gap', () => {
    open('check', { elements: [] });
    expect(screen.getByRole('status').textContent).toBe('No events yet');
    expect(screen.getByText('Nothing to check. The story holds.')).toBeTruthy();
  });
});

describe('Language', () => {
  const term = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

  it('lists the terms most used first, with their notes and contexts, marking one used in two', () => {
    open('language');
    const first = screen.getAllByRole('button', { pressed: false })[0]!;
    expect(first.textContent).toContain('order');
    expect(first.textContent).toContain('Floor, Pass');
    expect(first.textContent).toContain('2 contexts');
    expect(first.textContent).toContain('5 notes');
  });

  it('rings a chosen term’s notes, dimming the rest, and lets go when chosen again or on Escape', () => {
    const { acts } = open('language');
    fireEvent.click(term('order'));
    expect(lastRing(acts)![0]).toHaveLength(5);
    expect(lastRing(acts)![1]).toBe(true);
    expect(term('order').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(term('order'));
    expect(lastRing(acts)![0]).toEqual([]);
    fireEvent.click(term('order'));
    fireEvent.keyDown(term('order'), { key: 'Escape' });
    expect(term('order').getAttribute('aria-pressed')).toBe('false');
  });

  it('narrows the list to one context, and to the notes in none', () => {
    const { acts } = open('language');
    fireEvent.change(screen.getByRole('combobox', { name: 'Used in' }), {
      target: { value: IDS.pass },
    });
    expect(term('order').textContent).toContain('2 notes');
    fireEvent.click(term('order'));
    expect(lastRing(acts)![0]).toEqual([IDS.plateOrder, IDS.orderPlated]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Used in' }), {
      target: { value: 'none' },
    });
    expect(term('Table')).toBeTruthy();
  });

  it('previews a rename as it is typed and renames within what the list is narrowed to', () => {
    const { acts } = open('language');
    fireEvent.change(screen.getByRole('combobox', { name: 'Used in' }), {
      target: { value: IDS.pass },
    });
    fireEvent.click(term('order'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename Term' }));
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: /New term for order/i });
    expect(document.activeElement).toBe(field);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Rename' }).disabled).toBe(true);
    fireEvent.change(field, { target: { value: 'ticket' } });
    const ask = {
      from: field.defaultValue || 'order',
      to: 'ticket',
      scope: { type: 'context', id: IDS.pass },
    };
    expect(acts.previewRename).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'ticket', scope: ask.scope }),
    );
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(acts.rename).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ticket', scope: ask.scope }),
    );
    expect(acts.previewRename).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('leaves the board as it was on Escape, keeping the term chosen', () => {
    const { acts } = open('language');
    fireEvent.click(term('order'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename Term' }));
    const field = screen.getByRole('textbox');
    fireEvent.change(field, { target: { value: 'ticket' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(acts.rename).not.toHaveBeenCalled();
    expect(acts.previewRename).toHaveBeenLastCalledWith(null);
    expect(term('order').getAttribute('aria-pressed')).toBe('true');
  });

  // The keyboard never falls to the page when what held it is put away (board-review.md "The panel").
  it('hands the keyboard to Rename Term when Escape leaves the field, then keeps it on the term', () => {
    open('language');
    fireEvent.click(term('order'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename Term' }));
    const field = screen.getByRole('textbox');
    field.focus();
    fireEvent.keyDown(field, { key: 'Escape' });
    const rename = screen.getByRole('button', { name: 'Rename Term' });
    expect(document.activeElement).toBe(rename);
    fireEvent.keyDown(rename, { key: 'Escape' });
    expect(term('order').getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(term('order'));
  });

  it('hands the keyboard to the row where the renamed term stood, once the board is read again', () => {
    const acts = {
      ring: vi.fn<ReviewPanelActs['ring']>(),
      add: vi.fn<ReviewPanelActs['add']>(),
      answer: vi.fn<ReviewPanelActs['answer']>(),
      previewRename: vi.fn<ReviewPanelActs['previewRename']>(),
      renameWouldChange: vi.fn<ReviewPanelActs['renameWouldChange']>(() => true),
      rename: vi.fn<ReviewPanelActs['rename']>(),
      storyWalked: vi.fn<ReviewPanelActs['storyWalked']>(),
    };
    const tree = (elements: Element[]) => (
      <ReviewPanel
        tab="language"
        reading={read(elements)}
        mayWrite
        onTab={vi.fn<(tab: ReviewTab) => void>()}
        acts={acts}
      />
    );
    const view = render(tree(reviewBoardElements()));
    fireEvent.click(term('order'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename Term' }));
    const field = screen.getByRole('textbox');
    field.focus();
    fireEvent.change(field, { target: { value: 'item' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    // The board has not been read again yet: the keyboard waits rather than land on a row about to go.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(document.body);
    view.rerender(
      tree(renameTerm(reviewBoardElements(), 'order', 'item', { type: 'board' }, new Set())),
    );
    expect(document.activeElement).toBe(term('item'));
  });

  it('shows no Rename Term to whoever may not write', () => {
    open('language', { mayWrite: false });
    fireEvent.click(term('order'));
    expect(screen.queryByRole('button', { name: 'Rename Term' })).toBeNull();
  });

  it('says so when no two notes share a word', () => {
    open('language', { elements: [] });
    expect(screen.getByText('No shared terms yet. A term is a word two notes share.')).toBeTruthy();
  });
});

// docs/specs/004-interface-design/escape.md: a chosen term is a highlight on the board, let go from anywhere.
describe('Language on Escape from the board', () => {
  const term = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
  const canvas = () => screen.getByRole('main', { name: 'Canvas' });

  afterEach(() => resetEscapeLayersForTests());

  it('lets the chosen term go, keeping the keyboard on the board and the panel open', () => {
    const { acts } = open('language', { withBoard: true });
    fireEvent.click(term('order'));
    canvas().focus();
    expect(fireEvent.keyDown(canvas(), { key: 'Escape' })).toBe(false);
    expect(term('order').getAttribute('aria-pressed')).toBe('false');
    expect(lastRing(acts)![0]).toEqual([]);
    expect(document.activeElement).toBe(canvas());
    expect(screen.getByRole('tab', { name: 'Language' })).toBeTruthy();
  });

  it('drops a rename’s preview first, then lets the term go, one press each', () => {
    const { acts } = open('language', { withBoard: true });
    fireEvent.click(term('order'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename Term' }));
    fireEvent.change(screen.getByRole('textbox', { name: /New term/i }), {
      target: { value: 'ticket' },
    });
    canvas().focus();
    fireEvent.keyDown(canvas(), { key: 'Escape' });
    expect(acts.previewRename).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole('textbox', { name: /New term/i })).toBeNull();
    expect(term('order').getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(canvas(), { key: 'Escape' });
    expect(term('order').getAttribute('aria-pressed')).toBe('false');
    expect(acts.rename).not.toHaveBeenCalled();
  });

  it('leaves a field elsewhere and a menu their own Escape', () => {
    open('language', { withBoard: true });
    fireEvent.click(term('order'));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'A label' }), { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Copy' }), { key: 'Escape' });
    expect(term('order').getAttribute('aria-pressed')).toBe('true');
  });

  it('leaves a key another listener claimed, and every other key', () => {
    open('language', { withBoard: true });
    fireEvent.click(term('order'));
    const claimed = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    claimed.preventDefault();
    canvas().dispatchEvent(claimed);
    fireEvent.keyDown(canvas(), { key: 'Enter' });
    expect(term('order').getAttribute('aria-pressed')).toBe('true');
  });

  it('holds the highlight layer only while a term is chosen', () => {
    open('language', { withBoard: true });
    expect(heldEscapeLayers().highlight).toBeUndefined();
    fireEvent.click(term('order'));
    expect(heldEscapeLayers().highlight).toBe(true);
    fireEvent.click(term('order'));
    expect(heldEscapeLayers().highlight).toBeUndefined();
  });
});

describe('Story', () => {
  it('tells the timeline as steps, a phase rule after the pivotal one', () => {
    open('story');
    const steps = screen.getAllByRole('option');
    expect(steps).toHaveLength(5);
    expect(steps[0]!.textContent).toContain('Waiter: Take order');
    expect(steps[0]!.textContent).toContain('Order taken closes a phase');
    expect(steps[1]!.textContent).not.toContain('closes a phase');
  });

  it('walks with Next and Previous, ringing the step in hand and saying where it is', () => {
    const { acts } = open('story');
    const next = screen.getByRole<HTMLButtonElement>('button', { name: 'Next' });
    const previous = screen.getByRole<HTMLButtonElement>('button', { name: 'Previous' });
    expect(previous.disabled).toBe(true);
    fireEvent.click(next);
    expect(screen.getByText('Step 1 of 5')).toBeTruthy();
    expect(lastRing(acts)![0]).toContain(IDS.orderTaken);
    fireEvent.click(next);
    expect(screen.getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true');
    expect(lastRing(acts)![0]).toContain(IDS.orderPlated);
    fireEvent.click(previous);
    expect(screen.getByText('Step 1 of 5')).toBeTruthy();
    expect(acts.storyWalked).toHaveBeenCalledTimes(3);
  });

  it('walks with the arrow keys while the list has the focus, stopping at the ends', () => {
    open('story');
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'End' });
    expect(screen.getByText('Step 5 of 5')).toBeTruthy();
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(screen.getByText('Step 5 of 5')).toBeTruthy();
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(screen.getByText('Step 4 of 5')).toBeTruthy();
    fireEvent.keyDown(list, { key: 'Home' });
    expect(list.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id);
    fireEvent.click(screen.getAllByRole('option')[2]!);
    expect(screen.getByText('Step 3 of 5')).toBeTruthy();
  });

  it('lists the loose notes after the last step, and says so when there is no event', () => {
    open('story', {
      elements: [
        ...reviewBoardElements(),
        ...reviewBoardElements()
          .slice(0, 1)
          .map((el) => ({ ...el, id: 'loose', x: 5000 })),
      ],
    });
    expect(
      within(screen.getByRole('region', { name: 'Loose notes' })).getByText('Waiter'),
    ).toBeTruthy();
    cleanup();
    open('story', { elements: [] });
    expect(screen.getByText('No events yet. The story starts with one.')).toBeTruthy();
  });
});
