// docs/specs/021-event-storming/lane-plans.md "How the board places a plan".
import {
  ES_LANES,
  ES_NOTE_GAP,
  laneCentre,
  laneIndexAt,
  type Element,
  type StickyElement,
} from '@livedoc/document';
import { describe, expect, it } from 'vitest';
import { board, laneText, note } from '../testing';
import { at, kitchen, twoLanes, xs } from './kitchen.fixture';
import { placeLanePlan } from './place';

const laneOf = (el: Element) => {
  const note = el as StickyElement;
  return laneIndexAt(note.y + note.height / 2, ES_LANES);
};

describe('placing a lane plan', () => {
  it('stands the plan’s lanes one under the other, from the top-most lane its notes use', () => {
    const tab = board(
      { id: 'a', kind: 'domain-event', col: 0, lane: 2 },
      { id: 'b', kind: 'domain-event', col: 1, lane: 5 },
      { id: 'c', kind: 'domain-event', col: 2, lane: 9 },
    );
    const placed = placeLanePlan(tab, [
      { name: 'One', notes: ['c'] },
      { name: 'Two', notes: ['a', 'b'] },
    ]);
    expect(placed.top).toBe(2);
    expect(placed.elements.map(laneOf)).toEqual([3, 3, 2]);
  });

  it('keeps each note’s x where nothing stands in its way', () => {
    const tab = board(
      { id: 'a', kind: 'domain-event', col: 0, lane: 0 },
      { id: 'b', kind: 'domain-event', col: 1, lane: 4 },
      { id: 'c', kind: 'domain-event', col: 3, lane: 4 },
    );
    const placed = placeLanePlan(tab, [
      { name: 'One', notes: ['a', 'b'] },
      { name: 'Two', notes: ['c'] },
    ]);
    expect(xs(placed.elements)).toEqual(xs(tab.elements));
    expect(placed.blocked).toEqual([]);
  });

  it('opens a column too deep for its lane, in the order of the lanes the notes came from', () => {
    const placed = placeLanePlan(kitchen(), twoLanes);
    const gap = ES_NOTE_GAP;
    // The actor is narrower than the command under it, so it comes first by its moment, then the command, the event.
    expect(at(placed, 'cook')[0]).toBe(0);
    expect(at(placed, 'take-order')[0]).toBe(140 + gap);
    expect(at(placed, 'order-taken')[0]).toBe(140 + gap + 200 + gap);
  });

  it('moves every note to the right of an opened column by what was missing', () => {
    const placed = placeLanePlan(kitchen(), twoLanes);
    // The first column opened by 372; the policy stood at 216 and nothing else is on its new lane yet.
    expect(at(placed, 'fire-ticket')[0]).toBe(216 + 372);
    expect(at(placed, 'waiter')[0]).toBe(588 + 300 + ES_NOTE_GAP);
    expect(placed.elements.map(laneOf)).toEqual([0, 1, 0, 1, 0, 1, 1]);
  });

  it('centres each note on its lane whatever its height', () => {
    const placed = placeLanePlan(kitchen(), twoLanes);
    expect(at(placed, 'cook')[1]).toBe(laneCentre(0, ES_LANES) - 70);
    expect(at(placed, 'fire-ticket')[1]).toBe(laneCentre(1, ES_LANES) - 90);
  });

  it('places the same board and plan the same', () => {
    expect(placeLanePlan(kitchen(), twoLanes)).toEqual(placeLanePlan(kitchen(), twoLanes));
  });

  it('moves nothing but the plan’s notes', () => {
    const name = laneText('name', 0, -16, 'People');
    const locked = note({
      id: 'locked',
      kind: 'hotspot',
      col: 9,
      lane: 7,
      extra: { locked: true },
    });
    const tab = board(...kitchen().elements, name, locked);
    const placed = placeLanePlan(tab, twoLanes);
    expect(placed.elements.at(-2)).toBe(name);
    expect(placed.elements.at(-1)).toBe(locked);
    expect(placed.elements.map((el) => el.id)).toEqual(tab.elements.map((el) => el.id));
  });

  it('names the notes that stay which a placed note would land on', () => {
    // A locked note where the opened first column's event comes to stand.
    const locked = note({
      id: 'locked',
      kind: 'hotspot',
      col: 2,
      lane: 0,
      extra: { locked: true },
    });
    const clear = note({ id: 'clear', kind: 'hotspot', col: 9, lane: 0, extra: { locked: true } });
    const placed = placeLanePlan(board(...kitchen().elements, locked, clear), twoLanes);
    expect(placed.blocked).toEqual(['locked']);
  });

  it('leaves out a note the plan names that is not on the board', () => {
    const tab = board({ id: 'a', kind: 'domain-event', col: 0, lane: 1 });
    const placed = placeLanePlan(tab, [
      { name: 'One', notes: ['gone'] },
      { name: 'Two', notes: ['a'] },
    ]);
    expect(placed.elements.map(laneOf)).toEqual([2]);
  });

  it('starts at the first lane when the plan holds no note of the board', () => {
    expect(placeLanePlan(board(), [{ name: 'One', notes: ['gone'] }])).toEqual({
      elements: [],
      top: 0,
      blocked: [],
    });
  });
});
