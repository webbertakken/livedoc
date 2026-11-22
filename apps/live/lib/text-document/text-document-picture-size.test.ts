// docs/specs/034-text-documents/objects.md "Working with a picture": sizing by its handles (a corner keeps the ratio, an
// edge stretches one side, Shift keeps the ratio), never under 4.5 pt a side nor past the room; Image options' Width,
// Height and Scale, locked or not; the size written as one step, its crop scaling with it; Reset image back to its own
// size fitted to the room, its crop dropped.
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { PICTURE } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { resetPicture, selectedPicture, setPictureSize } from './text-document-picture-edit';
import { PICTURE_MIN_SIDE, changedPictureSize, resizedPicture } from './text-document-picture-size';
import { ownPictureSize } from './text-document-picture-insert';

const room = { width: 468, height: 648 };
const start = { width: 200, height: 100 };

describe('resizedPicture', () => {
  it('keeps the ratio from a corner, following the pointer along the diagonal', () => {
    expect(resizedPicture(start, 'se', 100, 50, { shift: false, room })).toEqual({
      width: 300,
      height: 150,
    });
    expect(resizedPicture(start, 'nw', 100, 50, { shift: false, room })).toEqual({
      width: 100,
      height: 50,
    });
  });

  it('stretches one side from an edge, the other kept', () => {
    expect(resizedPicture(start, 'e', 40, 30, { shift: false, room })).toEqual({
      width: 240,
      height: 100,
    });
    expect(resizedPicture(start, 'n', 40, -30, { shift: false, room })).toEqual({
      width: 200,
      height: 130,
    });
    expect(resizedPicture(start, 'w', 50, 0, { shift: false, room })).toEqual({
      width: 150,
      height: 100,
    });
  });

  it('keeps the ratio from an edge while Shift is held', () => {
    expect(resizedPicture(start, 'e', 100, 0, { shift: true, room })).toEqual({
      width: 300,
      height: 150,
    });
    expect(resizedPicture(start, 's', 0, 100, { shift: true, room })).toEqual({
      width: 400,
      height: 200,
    });
  });

  it('never goes under the least side nor past the room', () => {
    expect(resizedPicture(start, 'e', -500, 0, { shift: false, room })).toEqual({
      width: PICTURE_MIN_SIDE,
      height: 100,
    });
    expect(resizedPicture(start, 'se', -500, -500, { shift: false, room })).toEqual({
      width: 9,
      height: PICTURE_MIN_SIDE,
    });
    expect(resizedPicture(start, 'se', 1000, 1000, { shift: false, room })).toEqual({
      width: 468,
      height: 234,
    });
    expect(resizedPicture(start, 's', 0, 1000, { shift: false, room })).toEqual({
      width: 200,
      height: 648,
    });
  });

  it('lets the room win over the least side for a slender picture', () => {
    const slender = { width: 400, height: 2 };
    expect(resizedPicture(slender, 'se', 0, 0, { shift: false, room })).toEqual({
      width: 468,
      height: 2.34,
    });
  });

  it('leaves a picture of no size as it is', () => {
    expect(resizedPicture({ width: 0, height: 0 }, 'se', 10, 10, { shift: false, room })).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe('ownPictureSize', () => {
  it('is its pixels at 96 an inch, in points', () => {
    expect(ownPictureSize({ width: 960, height: 480 })).toEqual({ width: 720, height: 360 });
  });
});

describe('changedPictureSize', () => {
  const own = { width: 400, height: 200 };

  it('scales the other side with Width or Height while the ratio is locked', () => {
    expect(
      changedPictureSize(start, { field: 'width', value: 300 }, { lock: true, own, room }),
    ).toEqual({ width: 300, height: 150 });
    expect(
      changedPictureSize(start, { field: 'height', value: 50 }, { lock: true, own, room }),
    ).toEqual({ width: 100, height: 50 });
  });

  it('changes one side alone while unlocked', () => {
    expect(
      changedPictureSize(start, { field: 'width', value: 300 }, { lock: false, own, room }),
    ).toEqual({ width: 300, height: 100 });
  });

  it('reads Scale as a percent of its own size', () => {
    expect(
      changedPictureSize(start, { field: 'scaleWidth', value: 25 }, { lock: false, own, room }),
    ).toEqual({ width: 100, height: 100 });
    expect(
      changedPictureSize(start, { field: 'scaleHeight', value: 25 }, { lock: true, own, room }),
    ).toEqual({ width: 100, height: 50 });
  });

  it('has no Scale without its own size', () => {
    expect(
      changedPictureSize(
        start,
        { field: 'scaleWidth', value: 25 },
        { lock: false, own: null, room },
      ),
    ).toBeNull();
  });

  it('keeps within the least side and the room', () => {
    expect(
      changedPictureSize(start, { field: 'width', value: 0 }, { lock: false, own, room }),
    ).toEqual({ width: PICTURE_MIN_SIDE, height: 100 });
    expect(
      changedPictureSize(start, { field: 'width', value: 1000 }, { lock: true, own, room }),
    ).toEqual({ width: 468, height: 234 });
  });
});

const crop = { top: 0.1, right: 0, bottom: 0, left: 0.2 };
const picture = schema.nodes[PICTURE]!.create({
  media: 'm',
  width: 200,
  height: 100,
  alt: 'A field',
  crop,
});
const doc = schema.node('doc', null, [
  schema.nodes.paragraph!.create(null, [schema.text('a'), picture]),
]);
const selected = () => EditorState.create({ doc, selection: NodeSelection.create(doc, 2) });
const run = (command: ReturnType<typeof setPictureSize>) => {
  const state = selected();
  let next = state;
  const ran = command(state, (tr) => {
    next = state.apply(tr);
  });
  return { ran, next, attrs: next.doc.nodeAt(2)!.attrs };
};

describe('setPictureSize', () => {
  it('writes the size, its crop scaling with it, the picture kept selected', () => {
    const { ran, next, attrs } = run(setPictureSize(2, { width: 300, height: 150 }));
    expect(ran).toBe(true);
    expect(attrs).toMatchObject({ width: 300, height: 150, crop, alt: 'A field' });
    expect(selectedPicture(next)?.pos).toBe(2);
  });

  it('refuses where no picture is, or when the size is the same', () => {
    expect(run(setPictureSize(1, { width: 300, height: 150 })).ran).toBe(false);
    expect(run(setPictureSize(2, { width: 200, height: 100 })).ran).toBe(false);
  });
});

describe('resetPicture', () => {
  it('is its own size fitted to the room, its crop dropped', () => {
    const { ran, next, attrs } = run(
      resetPicture(2, { width: 1248, height: 624 }, { width: 468, height: 648 }),
    );
    expect(ran).toBe(true);
    expect(attrs).toMatchObject({ width: 468, height: 234, crop: null, alt: 'A field' });
    expect(selectedPicture(next)?.pos).toBe(2);
  });

  it('refuses where no picture is', () => {
    expect(run(resetPicture(1, { width: 10, height: 10 }, room)).ran).toBe(false);
  });
});
