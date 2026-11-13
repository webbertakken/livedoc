import { describe, expect, it } from 'vitest';
import type { ArrowElement } from './arrow-types';
import type { FreehandElement, ShapeElement, TextElement } from './element-types';
import type { Element } from './index';
import {
  flipSelection,
  mirroredAnchor,
  selectionPivot,
  turnReference,
  turnSelection,
  turnSelectionTo,
  turnsByHand,
} from './selection-transform';
import { decodeStrokePoints } from './stroke-points-cache';
import { encodeStrokePoints } from './stroke-points';

// docs/specs/008-canvas/selection-transforms.md

const box = (
  id: string,
  x: number,
  y: number,
  extra: Partial<ShapeElement> = {},
): ShapeElement => ({
  id,
  type: 'shape',
  shape: 'square',
  x,
  y,
  width: 20,
  height: 10,
  ...extra,
});

const byId = (els: Element[], id: string) => els.find((el) => el.id === id)!;
const ids = (...list: string[]) => new Set(list);

describe('selectionPivot', () => {
  it('is the centre of the frame the unlocked boxed members draw', () => {
    const els = [box('a', 0, 0), box('b', 80, 40), box('c', 1000, 1000, { locked: true })];
    expect(selectionPivot(els, ids('a', 'b', 'c'))).toEqual({ x: 50, y: 25 });
  });

  it('counts a turned member as drawn', () => {
    const els = [box('a', 0, 0, { rotation: 90 })];
    // Drawn 10 wide, 20 tall about the same centre.
    expect(selectionPivot(els, ids('a'))).toEqual({ x: 10, y: 5 });
  });

  it('pivots arrows alone on the box around their free ends', () => {
    const arrow: ArrowElement = {
      id: 'r',
      type: 'arrow',
      from: { kind: 'free', x: 0, y: 0 },
      to: { kind: 'free', x: 100, y: 50 },
    };
    expect(selectionPivot([arrow], ids('r'))).toEqual({ x: 50, y: 25 });
  });

  it('has none for a selection with no unlocked member', () => {
    expect(selectionPivot([box('a', 0, 0, { locked: true })], ids('a'))).toBeNull();
  });
});

describe('turnSelection', () => {
  it('orbits each member about the pivot and adds the turn to its angle', () => {
    // Two boxes side by side about the pivot (50, 5): a quarter turn stacks them vertically.
    const els = [box('a', 0, 0), box('b', 80, 0, { rotation: 180 })];
    const out = turnSelection(els, ids('a', 'b'), 90);
    const a = byId(out, 'a') as ShapeElement;
    const b = byId(out, 'b') as ShapeElement;
    // a's centre (10, 5) to (50, -35); b's centre (90, 5) to (50, 45).
    expect(a.x + a.width / 2).toBeCloseTo(50);
    expect(a.y + a.height / 2).toBeCloseTo(-35);
    expect(a.rotation).toBe(90);
    expect(b.x + b.width / 2).toBeCloseTo(50);
    expect(b.y + b.height / 2).toBeCloseTo(45);
    expect(b.rotation).toBe(270);
    expect(a.width).toBe(20);
  });

  it('turns a lone element about its own centre, leaving its box', () => {
    const out = turnSelection([box('a', 7, 9)], ids('a'), 45);
    expect(out[0]).toMatchObject({ x: 7, y: 9, rotation: 45 });
  });

  it('normalises the angle and stores upright as absent', () => {
    const out = turnSelection([box('a', 0, 0, { rotation: 270 })], ids('a'), 90);
    expect((out[0] as ShapeElement).rotation).toBeUndefined();
    expect('rotation' in out[0]!).toBe(false);
    const back = turnSelection([box('a', 0, 0, { rotation: 10 })], ids('a'), -20);
    expect((back[0] as ShapeElement).rotation).toBe(350);
  });

  it('turns by whole degrees only', () => {
    const out = turnSelection([box('a', 0, 0)], ids('a'), 12.6);
    expect((out[0] as ShapeElement).rotation).toBe(13);
  });

  it('returns the same list for no turn', () => {
    const els = [box('a', 0, 0)];
    expect(turnSelection(els, ids('a'), 0.2)).toBe(els);
    expect(turnSelection(els, ids('a'), 360)).toBe(els);
  });

  it('leaves locked members and elements outside the selection as they are', () => {
    const locked = box('l', 200, 0, { locked: true });
    const other = box('o', 300, 0);
    const els = [box('a', 0, 0), box('b', 80, 0), locked, other];
    const out = turnSelection(els, ids('a', 'b', 'l'), 90);
    expect(byId(out, 'l')).toBe(locked);
    expect(byId(out, 'o')).toBe(other);
  });

  it('orbits an annotation marker upright', () => {
    const marker: Element = { id: 'm', type: 'annotation', x: 80, y: 0, width: 20, height: 10 };
    const out = turnSelection([box('a', 0, 0), marker], ids('a', 'm'), 90);
    const m = byId(out, 'm') as { x: number; y: number; rotation?: number };
    expect(m.x + 10).toBeCloseTo(50);
    expect(m.y + 5).toBeCloseTo(45);
    expect(m.rotation).toBeUndefined();
  });

  it("orbits a pointer note upright and turns its tip about the note's centre", () => {
    const note = box('p', 80, 0, { shape: 'pointer-note', pointerTip: { x: 30, y: 5 } });
    const out = turnSelection([box('a', 0, 0), note], ids('a', 'p'), 90);
    const p = byId(out, 'p') as ShapeElement;
    expect(p.rotation).toBeUndefined();
    // The tip sat 20 right of the centre (10, 5): a quarter turn puts it 20 below.
    expect(p.pointerTip).toEqual({ x: 10, y: 25 });
  });

  it("orbits a selected arrow's free ends and turns its curve handles", () => {
    const arrow: ArrowElement = {
      id: 'r',
      type: 'arrow',
      from: { kind: 'free', x: 0, y: 5 },
      to: { kind: 'pinned', elementId: 'b', anchor: 'e' },
      curveOffset: { dx: 10, dy: 0 },
      curvePoints: [{ dx: 0, dy: 4 }],
    };
    const els: Element[] = [box('a', 0, 0), box('b', 80, 0), arrow];
    const out = byId(turnSelection(els, ids('a', 'b', 'r'), 90), 'r') as ArrowElement;
    expect(out.from).toEqual({ kind: 'free', x: expect.closeTo(50), y: expect.closeTo(-45) });
    expect(out.to).toEqual(arrow.to);
    expect(out.curveOffset!.dx).toBeCloseTo(0);
    expect(out.curveOffset!.dy).toBeCloseTo(10);
    expect(out.curvePoints![0]!.dx).toBeCloseTo(-4);
    expect(out.curvePoints![0]!.dy).toBeCloseTo(0);
  });
});

describe('turnReference and turnSelectionTo', () => {
  it('reads the first member that can turn, in document order', () => {
    const marker: Element = { id: 'm', type: 'annotation', x: 0, y: 0, width: 5, height: 5 };
    const els = [marker, box('a', 0, 0, { locked: true }), box('b', 50, 0, { rotation: 45 })];
    expect(turnReference(els, ids('m', 'a', 'b'))?.id).toBe('b');
  });

  it('turns the whole selection so the reference member lands on the angle', () => {
    const els = [box('a', 0, 0, { rotation: 45 }), box('b', 80, 0, { rotation: 90 })];
    const out = turnSelectionTo(els, ids('a', 'b'), 0);
    expect((byId(out, 'a') as ShapeElement).rotation).toBeUndefined();
    expect((byId(out, 'b') as ShapeElement).rotation).toBe(45);
    // Rigid: the two centres stay 80 apart.
    const ca = byId(out, 'a') as ShapeElement;
    const cb = byId(out, 'b') as ShapeElement;
    expect(Math.hypot(cb.x - ca.x, cb.y - ca.y)).toBeCloseTo(80);
  });

  it('sets a lone element to the angle in place', () => {
    expect(turnSelectionTo([box('a', 3, 4)], ids('a'), 225)[0]).toMatchObject({
      x: 3,
      y: 4,
      rotation: 225,
    });
  });

  it('changes nothing with no member that can turn', () => {
    const els = [box('a', 0, 0, { locked: true })];
    expect(turnSelectionTo(els, ids('a'), 90)).toBe(els);
  });
});

describe('mirroredAnchor', () => {
  it('swaps east and west for a horizontal flip', () => {
    expect(mirroredAnchor('e', 'horizontal')).toBe('w');
    expect(mirroredAnchor('ene', 'horizontal')).toBe('wnw');
    expect(mirroredAnchor('nne', 'horizontal')).toBe('nnw');
    expect(mirroredAnchor('n', 'horizontal')).toBe('n');
  });

  it('swaps north and south for a vertical flip', () => {
    expect(mirroredAnchor('n', 'vertical')).toBe('s');
    expect(mirroredAnchor('wnw', 'vertical')).toBe('wsw');
    expect(mirroredAnchor('sse', 'vertical')).toBe('nne');
    expect(mirroredAnchor('e', 'vertical')).toBe('e');
  });
});

describe('flipSelection', () => {
  it('mirrors the members left to right about the pivot, negating their angles', () => {
    const els = [box('a', 0, 0, { rotation: 30 }), box('b', 80, 40)];
    const pivot = selectionPivot(els, ids('a', 'b'))!;
    const out = flipSelection(els, ids('a', 'b'), 'horizontal');
    expect(byId(out, 'a')).toMatchObject({ x: 2 * pivot.x - 20, y: 0, rotation: 330 });
    expect(byId(out, 'b')).toMatchObject({ x: 2 * pivot.x - 100, y: 40 });
  });

  it('mirrors top to bottom for a vertical flip', () => {
    const els = [box('a', 0, 0), box('b', 80, 40)];
    const out = flipSelection(els, ids('a', 'b'), 'vertical');
    expect(byId(out, 'a')).toMatchObject({ x: 0, y: 40 });
    expect(byId(out, 'b')).toMatchObject({ x: 80, y: 0 });
  });

  it("reflects a stroke's ink and keeps text readable", () => {
    const stroke: FreehandElement = {
      id: 'f',
      type: 'freehand',
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      closed: false,
      packedPoints: encodeStrokePoints([
        { nx: 0, ny: 0 },
        { nx: 0.25, ny: 1 },
      ]),
    };
    const text: TextElement = {
      id: 't',
      type: 'text',
      x: 80,
      y: 0,
      width: 20,
      height: 10,
      label: 'Hi',
    };
    const out = flipSelection([stroke, text], ids('f', 't'), 'horizontal');
    const pts = decodeStrokePoints((byId(out, 'f') as FreehandElement).packedPoints);
    expect(pts.nx[0]).toBeCloseTo(1);
    expect(pts.nx[1]).toBeCloseTo(0.75);
    expect(byId(out, 't')).toEqual({ ...text, x: 0 });
  });

  it('restores the selection exactly when flipped twice', () => {
    const els = [box('a', 3, 7, { rotation: 15 }), box('b', 91, 44)];
    const twice = flipSelection(
      flipSelection(els, ids('a', 'b'), 'horizontal'),
      ids('a', 'b'),
      'horizontal',
    );
    expect(twice).toEqual(els);
    const twiceV = flipSelection(
      flipSelection(els, ids('a', 'b'), 'vertical'),
      ids('a', 'b'),
      'vertical',
    );
    expect(twiceV).toEqual(els);
  });

  it('moves an end pinned to a flipped member to the mirrored anchor', () => {
    const arrow: ArrowElement = {
      id: 'r',
      type: 'arrow',
      from: { kind: 'pinned', elementId: 'a', anchor: 'e' },
      to: { kind: 'pinned', elementId: 'x', anchor: 'w' },
    };
    const els: Element[] = [box('a', 0, 0), box('x', 200, 0), arrow];
    const out = byId(flipSelection(els, ids('a'), 'horizontal'), 'r') as ArrowElement;
    expect(out.from).toEqual({ kind: 'pinned', elementId: 'a', anchor: 'w' });
    expect(out.to).toEqual(arrow.to);
  });

  it("reflects a selected arrow's free ends, curve handles and label side", () => {
    const arrow: ArrowElement = {
      id: 'r',
      type: 'arrow',
      from: { kind: 'free', x: 0, y: 0 },
      to: { kind: 'free', x: 100, y: 50 },
      curveOffset: { dx: 5, dy: 6 },
      elbowOffset: { dx: 1, dy: 2 },
      labelOffset: { t: 0.3, offset: 12 },
    };
    const out = byId(flipSelection([arrow], ids('r'), 'horizontal'), 'r') as ArrowElement;
    expect(out.from).toEqual({ kind: 'free', x: 100, y: 0 });
    expect(out.to).toEqual({ kind: 'free', x: 0, y: 50 });
    expect(out.curveOffset).toEqual({ dx: -5, dy: 6 });
    expect(out.elbowOffset).toEqual({ dx: -1, dy: 2 });
    expect(out.labelOffset).toEqual({ t: 0.3, offset: -12 });
  });

  it("reflects a pointer note's tip", () => {
    const note = box('p', 0, 0, { shape: 'pointer-note', pointerTip: { x: 30, y: 5 } });
    const out = byId(flipSelection([note], ids('p'), 'horizontal'), 'p') as ShapeElement;
    expect(out.pointerTip).toEqual({ x: -10, y: 5 });
  });

  it('leaves locked members as they are and returns the same list with nothing to flip', () => {
    const locked = box('l', 0, 0, { locked: true });
    const els = [locked];
    expect(flipSelection(els, ids('l'), 'horizontal')).toBe(els);
  });
});

describe('selection transforms at their edges', () => {
  const plain: ArrowElement = {
    id: 'r',
    type: 'arrow',
    from: { kind: 'free', x: 0, y: 0 },
    to: { kind: 'pinned', elementId: 'x', anchor: 'n' },
  };

  it('turns a plain arrow without adding curve fields', () => {
    const out = turnSelection([plain, box('x', 100, 0)], ids('r'), 90, { x: 0, y: 10 });
    expect(byId(out, 'r')).toEqual({ ...plain, from: { kind: 'free', x: 10, y: 10 } });
  });

  it('changes nothing with no member to pivot on', () => {
    const els = [box('a', 0, 0, { locked: true })];
    expect(turnSelection(els, ids('a'), 90)).toBe(els);
  });

  it('flips a plain arrow without adding curve fields, leaving an end on an unflipped element', () => {
    const out = byId(
      flipSelection([plain, box('x', 100, 0)], ids('r'), 'vertical', { x: 0, y: 10 }),
      'r',
    );
    expect(out).toEqual({ ...plain, from: { kind: 'free', x: 0, y: 20 } });
  });

  it('leaves an unselected arrow with no end on a flipped member as it is', () => {
    const els: Element[] = [box('a', 0, 0), box('x', 100, 0), plain];
    expect(byId(flipSelection(els, ids('a'), 'horizontal'), 'r')).toBe(plain);
  });

  it("reflects a pointer note's tip top to bottom", () => {
    const note = box('p', 0, 0, { shape: 'pointer-note', pointerTip: { x: 5, y: 30 } });
    const out = byId(flipSelection([note], ids('p'), 'vertical'), 'p') as ShapeElement;
    expect(out.pointerTip).toEqual({ x: 5, y: -20 });
  });

  it('keeps an annotation marker unturned under a flip', () => {
    const marker: Element = { id: 'm', type: 'annotation', x: 0, y: 0, width: 5, height: 5 };
    expect(flipSelection([box('a', 20, 0), marker], ids('a', 'm'), 'horizontal')[1]).toMatchObject({
      x: 35,
    });
  });
});

describe('turnsByHand', () => {
  it('lets an element that rotates turn by hand', () => {
    expect(turnsByHand(box('a', 0, 0))).toBe(true);
  });

  it('keeps an annotation marker, an event-storming note and a Sheet-anchored chart from turning', () => {
    const marker: Element = { id: 'm', type: 'annotation', x: 0, y: 0, width: 5, height: 5 };
    expect(turnsByHand(marker)).toBe(false);
    expect(
      turnsByHand({
        id: 's',
        type: 'sticky',
        x: 0,
        y: 0,
        width: 5,
        height: 5,
        esKind: 'domain-event',
      }),
    ).toBe(false);
    expect(
      turnsByHand(
        box('c', 0, 0, {
          chartSource: { sheetId: 's' },
          sheetAnchor: { x: 0, y: 0 },
        } as Partial<ShapeElement>),
      ),
    ).toBe(false);
  });
});
