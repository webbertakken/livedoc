// docs/specs/034-text-documents/objects.md "Working with a picture": the rotation handle turns a picture about its
// centre to follow the pointer, Shift snapping to 15° steps; ⌥← / ⌥→ turn it 15°, ⌥⇧← / ⌥⇧→ 1°; a turn is held
// clockwise from 0 to below 360; a turned picture's handles read the pointer along its own sides. The turn is written
// as one step.
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { PICTURE } from '@livedoc/text-documents';
import {
  alongPicture,
  draggedRotation,
  pointerAngle,
  turnedBy,
} from './text-document-picture-rotate';
import { selectedPicture, setPictureRotation } from './text-document-picture-edit';
import { textDocumentSchema as schema } from './text-document-schema';

const centre = { x: 100, y: 100 };
const up = { x: 100, y: 50 };

describe('pointerAngle', () => {
  it('is 0 straight up, growing clockwise', () => {
    expect(pointerAngle(centre, up)).toBe(0);
    expect(pointerAngle(centre, { x: 150, y: 100 })).toBe(90);
    expect(pointerAngle(centre, { x: 50, y: 100 })).toBe(-90);
  });
});

describe('draggedRotation', () => {
  it('turns by how far the pointer goes round the centre', () => {
    expect(draggedRotation(0, centre, up, { x: 150, y: 100 }, { shift: false })).toBe(90);
    expect(draggedRotation(30, centre, up, { x: 50, y: 100 }, { shift: false })).toBe(300);
  });

  it('snaps to 15° steps while Shift is held', () => {
    const near = { x: 100 + 50 * Math.sin(0.3), y: 100 - 50 * Math.cos(0.3) };
    expect(draggedRotation(0, centre, up, near, { shift: false })).toBe(17.19);
    expect(draggedRotation(0, centre, up, near, { shift: true })).toBe(15);
  });

  it('is 0 for a whole turn', () => {
    expect(
      draggedRotation(
        350,
        centre,
        up,
        { x: 100 + 50 * Math.sin(Math.PI / 18), y: 100 - 50 * Math.cos(Math.PI / 18) },
        { shift: false },
      ),
    ).toBe(0);
  });
});

describe('turnedBy', () => {
  it('turns clockwise and back past 0', () => {
    expect(turnedBy(0, 15)).toBe(15);
    expect(turnedBy(0, -15)).toBe(345);
    expect(turnedBy(359, 1)).toBe(0);
  });
});

describe('alongPicture', () => {
  it('is the move itself unturned', () => {
    expect(alongPicture(10, -4, 0)).toEqual({ dx: 10, dy: -4 });
  });

  it("reads a move along the turned picture's own sides", () => {
    const quarter = alongPicture(10, 0, 90);
    expect(quarter.dx).toBeCloseTo(0, 9);
    expect(quarter.dy).toBeCloseTo(-10, 9);
    const half = alongPicture(10, 5, 180);
    expect(half.dx).toBeCloseTo(-10, 9);
    expect(half.dy).toBeCloseTo(-5, 9);
  });
});

// The turn written as one step, the picture kept selected.
describe('setPictureRotation', () => {
  const picture = schema.nodes[PICTURE]!.create({
    media: 'm',
    width: 200,
    height: 100,
    alt: 'Sky',
  });
  const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(null, [picture])]);
  const run = (pos: number, rotation: number, from = doc) => {
    const state = EditorState.create({ doc: from, selection: NodeSelection.create(from, 1) });
    let after = state;
    const ran = setPictureRotation(pos, rotation)(state, (tr) => {
      after = state.apply(tr);
    });
    return { ran, after };
  };

  it('writes the turn as the picture holds it', () => {
    const { ran, after } = run(1, -90);
    expect(ran).toBe(true);
    expect(after.doc.nodeAt(1)!.attrs).toMatchObject({ rotation: 270, width: 200, alt: 'Sky' });
    expect(selectedPicture(after)?.pos).toBe(1);
  });

  it('writes no turn as none', () => {
    const turned = run(1, 45).after.doc;
    const { ran, after } = run(1, 360, turned);
    expect(ran).toBe(true);
    expect(after.doc.nodeAt(1)!.attrs.rotation).toBeNull();
  });

  it('refuses where no picture is, or when nothing changes', () => {
    expect(run(0, 30).ran).toBe(false);
    expect(run(1, 0).ran).toBe(false);
    expect(run(1, Number.NaN).ran).toBe(false);
  });
});
