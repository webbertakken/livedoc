import { describe, expect, it } from 'vitest';
import { newContextElement, type Element, type StickyElement } from '@livedoc/document';
import { KIND, REWORD, STEP, byId, changed, named, note, orderFlow } from './change-board.fixture';
import { suggestionsInTimeline } from './suggestion-hints';
import { panelRowBounds, panelRowId, panelRowKey, panelRows } from './suggestion-rows';
import { changeKey, contextsKey, planKey } from './suggestion-view';
import { lanePlan, plannedKitchen } from './lane-board.fixture';

// The suggestions panel's rows (docs/specs/021-event-storming/suggestions.md "The suggestions panel"): notes,
// contexts, name suggestions and note changes in one timeline.

const NONE: ReadonlySet<string> = new Set();

const suggestion = (id: string, anchorId: string): StickyElement => ({
  ...note(id, `words ${id}`, 0),
  esSuggestion: { anchorId, side: 'after' },
});

function board(): Element[] {
  const flow = orderFlow();
  return changed(
    named(
      named(
        [
          ...flow,
          suggestion('s', 'placed'),
          newContextElement({
            id: 'refunds',
            name: 'Refunds',
            notes: [byId(flow, 'refund')],
            suggestion: { reason: 'Its own part.' },
          }),
        ],
        ['fulfilment'],
        'Shipping',
      ),
      ['ordering', 'fulfilment'],
      'Shop',
    ),
    'pack',
    REWORD,
    KIND,
  );
}

const rowsOf = (elements: Element[]) =>
  panelRows({
    elements,
    timeline: suggestionsInTimeline(elements),
    showAllSpots: null,
    inertIds: NONE,
  });

describe('panelRows', () => {
  it('lists notes, contexts, names, merges and note changes along the timeline', () => {
    expect(rowsOf(board()).map((row) => [row.type, panelRowId(row)])).toEqual([
      // The merge spans the board from its left-most note.
      ['merge', 'merge:fulfilment ordering'],
      ['note', 's'],
      ['context', 'refunds'],
      ['names', 'names:fulfilment'],
      ['change', 'change:pack:0'],
      ['change', 'change:pack:1'],
    ]);
  });

  it('opens a note’s row at its Show All spot when Show All is on', () => {
    const elements = board();
    const spot = { x: 1, y: 2, width: 200, height: 200 };
    const rows = panelRows({
      elements,
      timeline: suggestionsInTimeline(elements),
      showAllSpots: new Map([['s', spot]]),
      inertIds: NONE,
    });
    expect(rows.find((row) => row.type === 'note')).toMatchObject({ spot });
  });

  it('is empty for a board with nothing suggested', () => {
    expect(rowsOf(orderFlow())).toEqual([]);
  });
});

describe('a row’s preview key and the box it brings into view', () => {
  const rows = rowsOf(board());
  const row = (id: string) => rows.find((r) => panelRowId(r) === id)!;

  it('previews a note or a context as itself, a change as its mark does, names as their contexts', () => {
    expect(panelRowKey(row('s'))).toBe('s:s');
    expect(panelRowKey(row('refunds'))).toBe('c:refunds');
    expect(panelRowKey(row('change:pack:1'))).toBe(changeKey('pack', 1));
    expect(panelRowKey(row('names:fulfilment'))).toBe(contextsKey(['fulfilment']));
    expect(panelRowKey(row('merge:fulfilment ordering'))).toBe(
      contextsKey(['ordering', 'fulfilment']),
    );
  });

  it('brings a note’s anchor and spot, or a row’s own box, into view', () => {
    const placed = byId(board(), 'placed');
    expect(panelRowBounds(row('s'))).toMatchObject({ x: placed.x, width: 200 + STEP });
    expect(panelRowBounds(row('change:pack:0'))).toMatchObject({ x: 5 * STEP, width: 200 });
    expect(panelRowBounds(row('names:fulfilment'))).toMatchObject({ x: 5 * STEP });
  });
});

// docs/specs/021-event-storming/lane-plans.md "How a person sees and decides".
describe('the lane plan among the rows', () => {
  it('is listed first, whatever stands left of it', () => {
    const elements = [...board(), lanePlan()];
    const rows = panelRows({
      elements,
      timeline: suggestionsInTimeline(elements),
      showAllSpots: null,
      inertIds: NONE,
    });
    expect(rows[0]!.type).toBe('lane-plan');
    expect(rows.filter((row) => row.type === 'lane-plan')).toHaveLength(1);
  });

  it('has an id of its own, previews the plan and brings the board as it would be into view', () => {
    const tab = plannedKitchen();
    const [row] = panelRows({
      elements: tab.elements,
      timeline: [],
      showAllSpots: null,
      inertIds: NONE,
    });
    expect(panelRowId(row!)).toBe('lane-plan:plan');
    expect(panelRowKey(row!)).toBe(planKey('plan'));
    expect(panelRowBounds(row!).width).toBeGreaterThan(0);
  });
});
