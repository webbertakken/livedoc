import { describe, expect, it } from 'vitest';
import { ES_LANES, ES_NOTE_GAP, laneCentre, type Element, type Rect } from '@livedoc/document';
import { openLane, planLaneOpening } from './lane-opening';

// docs/specs/021-event-storming/suggestions.md "Opening a lane": an applied note above or below its anchor makes
// room on that lane, with no overlap and no gap, and nothing on any other lane moves.

const LANE = 3;
const top = (lane: number, height = 200) => laneCentre(lane, ES_LANES) - height / 2;
const box = (id: string, x: number, width = 200, lane = LANE, extra: Partial<Element> = {}) =>
  ({
    id,
    type: 'sticky',
    esKind: 'domain-event',
    label: id,
    x,
    y: top(lane, 200),
    width,
    height: 200,
    ...extra,
  }) as Element;
const spotAt = (x: number, width = 200): Rect => ({ x, y: top(LANE), width, height: 200 });
const xOf = (els: Element[], id: string) => (els.find((el) => el.id === id) as { x: number }).x;

describe('planLaneOpening', () => {
  it('lands on a free spot and moves nothing', () => {
    const els = [box('p', 0), box('q', 1000)];
    const plan = planLaneOpening(els, spotAt(400));
    expect(plan.bounds.x).toBe(400);
    expect(plan.shiftDx).toBe(0);
    expect(openLane(els, plan)).toBe(els);
  });

  it('takes the place of the note it covers, and the rest of the lane moves one note along', () => {
    // A 300-wide note starting 27 left of the spot, then its neighbour one gutter on.
    const els = [box('before', 0), box('cover', 216, 300), box('next', 532)];
    const plan = planLaneOpening(els, spotAt(243));
    expect(plan.bounds.x).toBe(216);
    expect(plan.shiftDx).toBe(200 + ES_NOTE_GAP);
    const after = openLane(els, plan);
    expect(xOf(after, 'before')).toBe(0);
    expect(xOf(after, 'cover')).toBe(216 + 216);
    expect(xOf(after, 'next')).toBe(532 + 216);
  });

  it('lands one gutter after a note that covers the spot from the left', () => {
    // Its centre lies before the spot's centre: the note stays, and the new one stands after it.
    const els = [box('left', 0, 300), box('next', 316)];
    const plan = planLaneOpening(els, spotAt(150));
    expect(plan.bounds.x).toBe(300 + ES_NOTE_GAP);
    const after = openLane(els, plan);
    expect(xOf(after, 'left')).toBe(0);
    expect(xOf(after, 'next')).toBe(316 + 216);
  });

  it('lands on the spot on an empty lane, or at the end of one', () => {
    expect(planLaneOpening([], spotAt(400)).bounds.x).toBe(400);
    const plan = planLaneOpening([box('far-left', 0)], spotAt(400));
    expect([plan.bounds.x, plan.shiftDx, plan.shiftedIds]).toEqual([400, 0, []]);
  });

  it('closes the lane up to one gutter after the new note, never wider', () => {
    // The next note sits 5 past the spot's end: it moves just enough for one gutter.
    const els = [box('next', 605)];
    const plan = planLaneOpening(els, spotAt(400));
    expect(plan.bounds.x).toBe(400);
    expect(plan.shiftDx).toBe(400 + 200 + ES_NOTE_GAP - 605);
  });

  it('opens only that lane: other lanes, locked notes and suggestions stay', () => {
    const els = [
      box('occupant', 400),
      box('other-lane', 400, 200, LANE - 1),
      box('locked', 1200, 200, LANE, { locked: true }),
      box('ghost', 400, 200, LANE, {
        esSuggestion: { anchorId: 'other-lane', side: 'below' },
      } as never),
    ];
    const after = openLane(els, planLaneOpening(els, spotAt(400)));
    expect(xOf(after, 'occupant')).toBe(616);
    expect(xOf(after, 'other-lane')).toBe(400);
    expect(xOf(after, 'locked')).toBe(1200);
    expect(xOf(after, 'ghost')).toBe(400);
  });

  it('carries the notes it may not open around along with the lane', () => {
    // A note on a hidden or locked layer neither decides where the lane opens nor is left behind.
    const els = [box('hidden', 400), box('next', 500)];
    const plan = planLaneOpening(els, spotAt(400), new Set(['hidden']));
    expect(plan.bounds.x).toBe(400);
    const after = openLane(els, plan);
    expect(xOf(after, 'next')).toBe(616);
    expect(xOf(after, 'hidden')).toBe(516);
  });
});
