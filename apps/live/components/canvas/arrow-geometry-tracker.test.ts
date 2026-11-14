import { describe, expect, it } from 'vitest';
import {
  buildElementGrid,
  buildElementIndex,
  createArrow,
  createPinnedArrow,
  createShape,
  type Element,
  resolveFinish,
  type Finish,
} from '@livedoc/document';
import { arrowViewGeometry } from './arrow-view-frame';
import { buildArrowLinks } from './drag-affected-arrows';
import { createArrowGeometryTracker } from './arrow-geometry-tracker';
import { buildReferenceBoard } from '../../e2e/perf/reference-board';

// docs/specs/008-canvas/canvas-performance.md "A release re-renders what moved, too": every arrow's frame and holes
// are worked out again only where a change of the board can have moved them, and come out as a whole-board pass
// would have them.

const box = (id: string, x: number, y = 0) => ({
  ...createShape('square', x, y),
  id,
  fillColor: '#fff',
});
const hub = box('hub', 400, 0);
const a = box('a', 0, 300);
const b = box('b', 800, 300);
const c = box('c', 1600, 300);
const far = box('far', 3000, 3000);
// Two arrows fanning into the hub's south anchor, from a and b: moving a can reorder the fan.
const aHub = { ...createPinnedArrow('a', 'n', 'hub', 's'), id: 'a-hub' };
const bHub = { ...createPinnedArrow('b', 'n', 'hub', 's'), id: 'b-hub' };
const bc = { ...createPinnedArrow('b', 'e', 'c', 'w'), id: 'b-c' };
const loose = { ...createArrow(1200, -400, 1200, 900), id: 'loose' };
const distant = { ...createArrow(5000, 5000, 5400, 5000), id: 'distant' };
const BOARD: Element[] = [hub, a, b, c, far, aHub, bHub, bc, loose, distant];

const replace = (els: Element[], id: string, patch: Record<string, unknown>) =>
  els.map((el): Element => (el.id === id ? { ...el, ...patch } : el));

function inputs(elements: Element[], tabFinish?: Finish) {
  return {
    elements,
    index: buildElementIndex(elements),
    grid: buildElementGrid(elements),
    links: buildArrowLinks(elements),
    tabFinish,
  };
}

// What a whole-board pass draws: every arrow from scratch.
function wholeBoard(elements: Element[], tabFinish?: Finish) {
  const { index, grid } = inputs(elements, tabFinish);
  return new Map(
    elements.flatMap((el) =>
      el.type === 'arrow'
        ? [
            [
              el.id,
              arrowViewGeometry(el, index, grid, resolveFinish(el.finish, tabFinish)),
            ] as const,
          ]
        : [],
    ),
  );
}

function tracked(...boards: Element[][]) {
  const tracker = createArrowGeometryTracker();
  return boards.map((board) => tracker.geometryFor(inputs(board)));
}

describe('createArrowGeometryTracker', () => {
  it('draws the first board as a whole-board pass does', () => {
    expect(tracked(BOARD)[0]).toEqual(wholeBoard(BOARD));
  });

  it('hands back the same geometry for the same board', () => {
    const tracker = createArrowGeometryTracker();
    const first = tracker.geometryFor(inputs(BOARD));
    expect(tracker.geometryFor(inputs(BOARD))).toBe(first);
  });

  it('works out again only the arrows a moved box can move, the rest kept as they were', () => {
    const moved = replace(BOARD, 'c', { y: 340 });
    const [before, after] = tracked(BOARD, moved);
    expect(after).toEqual(wholeBoard(moved));
    expect(after!.get('b-c')).not.toBe(before!.get('b-c'));
    for (const id of ['a-hub', 'b-hub', 'loose', 'distant'])
      expect(after!.get(id), id).toBe(before!.get(id));
  });

  it("works out again a fan's other arrows when one of its arrows moves", () => {
    const moved = replace(BOARD, 'a', { x: 1000 });
    const [, after] = tracked(BOARD, moved);
    expect(after).toEqual(wholeBoard(moved));
  });

  it('cuts an arrow where a box moves across it, and mends it where one leaves', () => {
    const across = replace(BOARD, 'far', { x: 1150, y: 200 });
    const back = BOARD;
    const [, crossed, left] = tracked(BOARD, across, back);
    expect(crossed!.get('loose')!.holes).toHaveLength(1);
    expect(crossed).toEqual(wholeBoard(across));
    expect(left).toEqual(wholeBoard(back));
  });

  it('cuts an arrow where a new box lands on it, and mends it when the box goes', () => {
    const landed = [...BOARD, box('new', 1150, 200)];
    const [, added, removed] = tracked(BOARD, landed, BOARD);
    expect(added!.get('loose')!.holes).toHaveLength(1);
    expect(added).toEqual(wholeBoard(landed));
    expect(removed).toEqual(wholeBoard(BOARD));
  });

  it('draws an added arrow and forgets a removed one', () => {
    const extra = { ...createPinnedArrow('a', 'e', 'c', 'w'), id: 'extra' };
    const grown = [...BOARD, extra];
    const [, added, removed] = tracked(BOARD, grown, BOARD);
    expect(added).toEqual(wholeBoard(grown));
    expect(removed).toEqual(wholeBoard(BOARD));
  });

  it('draws every arrow again for a new finish or a new paint order', () => {
    const tracker = createArrowGeometryTracker();
    tracker.geometryFor(inputs(BOARD));
    expect(tracker.geometryFor(inputs(BOARD, 'professional'))).toEqual(
      wholeBoard(BOARD, 'professional'),
    );
    const reordered = [...BOARD.slice(1), BOARD[0]!];
    expect(tracker.geometryFor(inputs(reordered, 'professional'))).toEqual(
      wholeBoard(reordered, 'professional'),
    );
  });
});

describe('on the reference board', () => {
  it('draws every box moved in turn as a whole-board pass does', () => {
    const board = buildReferenceBoard(1, 300);
    const tracker = createArrowGeometryTracker();
    tracker.geometryFor(inputs(board));
    let now = board;
    const boxes = board.filter((el) => el.type === 'shape').slice(0, 6);
    boxes.forEach((moved, i) => {
      now = replace(now, moved.id, { x: (moved as { x: number }).x + 90 * (i + 1), y: 60 * i });
      expect(tracker.geometryFor(inputs(now)), moved.id).toEqual(wholeBoard(now));
    });
  });
});
