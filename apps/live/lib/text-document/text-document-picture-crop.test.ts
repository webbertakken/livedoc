// docs/specs/034-text-documents/objects.md "Working with a picture", Cropping: a mark moves its side (a corner its two)
// over the picture as drawn, inward to cut and outward back to its own edge, at least 4.5 pt kept each way; the
// picture's scale never changes, its box following what is left. The model's crop is shares to four decimals; it is
// written as one step.
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { PICTURE } from '@livedoc/text-documents';
import { cropOf, croppedPicture } from './text-document-picture-crop';
import { selectedPicture, setPictureCrop } from './text-document-picture-edit';
import { textDocumentSchema as schema } from './text-document-schema';

const none = { top: 0, right: 0, bottom: 0, left: 0 };
// 200 × 100 points shown, nothing cut.
const whole = { width: 200, height: 100, crop: null };

describe('cropOf', () => {
  it('reads no crop as nothing cut, and a crop as its shares', () => {
    expect(cropOf(null)).toEqual(none);
    expect(cropOf({ top: 0.1, right: 'x', bottom: 2, left: 0.2 })).toEqual({
      ...none,
      top: 0.1,
      left: 0.2,
    });
  });
});

describe('croppedPicture', () => {
  it('cuts the right side inward, the scale kept', () => {
    expect(croppedPicture(whole, 'e', -50, 0)).toEqual({
      width: 150,
      height: 100,
      crop: { ...none, right: 0.25 },
    });
  });

  it('cuts two sides from a corner, freely', () => {
    expect(croppedPicture(whole, 'nw', 20, 10)).toEqual({
      width: 180,
      height: 90,
      crop: { ...none, top: 0.1, left: 0.1 },
    });
  });

  it('brings a cut side back, as far as its own edge', () => {
    // 150 × 100 shown of a 200 × 100 picture, its right quarter cut.
    const cut = { width: 150, height: 100, crop: { ...none, right: 0.25 } };
    expect(croppedPicture(cut, 'e', 30, 0)).toEqual({
      width: 180,
      height: 100,
      crop: { ...none, right: 0.1 },
    });
    expect(croppedPicture(cut, 'e', 500, 0)).toEqual({ width: 200, height: 100, crop: null });
    expect(croppedPicture(cut, 'w', -40, 0)).toMatchObject({ width: 150 });
  });

  it('keeps at least 4.5 pt each way', () => {
    expect(croppedPicture(whole, 's', 0, -500)).toEqual({
      width: 200,
      height: 4.5,
      crop: { ...none, bottom: 0.955 },
    });
    expect(croppedPicture(whole, 'w', 500, 0)).toEqual({
      width: 4.5,
      height: 100,
      crop: { ...none, left: 0.9775 },
    });
  });

  it('measures each side by the picture as drawn, a cut one included', () => {
    // Its left half cut: 100 points shown of a 200-point picture.
    const half = { width: 100, height: 100, crop: { ...none, left: 0.5 } };
    expect(croppedPicture(half, 'e', -20, 0)).toEqual({
      width: 80,
      height: 100,
      crop: { ...none, left: 0.5, right: 0.1 },
    });
  });

  it('leaves a picture of no size as it is', () => {
    const empty = { width: 0, height: 0, crop: null };
    expect(croppedPicture(empty, 'e', -10, 0)).toEqual(empty);
  });
});

// The crop written as one step, the picture kept selected.
describe('setPictureCrop', () => {
  const crop = { ...none, right: 0.25 };
  const picture = schema.nodes[PICTURE]!.create({
    media: 'm',
    width: 200,
    height: 100,
    alt: 'Sky',
  });
  const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(null, [picture])]);
  const run = (pos: number, next: Parameters<typeof setPictureCrop>[1]) => {
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 1) });
    let after = state;
    const ran = setPictureCrop(pos, next)(state, (tr) => {
      after = state.apply(tr);
    });
    return { ran, after };
  };

  it('writes its box and its crop', () => {
    const { ran, after } = run(1, { width: 150, height: 100, crop });
    expect(ran).toBe(true);
    expect(after.doc.nodeAt(1)!.attrs).toMatchObject({ width: 150, height: 100, crop, alt: 'Sky' });
    expect(selectedPicture(after)?.pos).toBe(1);
  });

  it('refuses where no picture is, or when nothing changes', () => {
    expect(run(0, { width: 150, height: 100, crop }).ran).toBe(false);
    expect(run(1, { width: 200, height: 100, crop: null }).ran).toBe(false);
  });
});
