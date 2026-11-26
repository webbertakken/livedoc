// docs/specs/035-pdf-documents/marks.md "Making a mark": a Polygon, a Cloud and Connected lines are made a corner a
// press; a press on the first corner closes a Polygon or a Cloud; a press within PDF_SHAPE_MIN_PT of the last corner
// adds none; the PDF_POLYGON_MAX_CORNERS th ends it; a press on another page begins afresh; fewer than 3 corners, or 2
// for Connected lines, make no mark; Backspace takes the last corner back.
import { describe, expect, it } from 'vitest';
import { PDF_POLYGON_MAX_CORNERS } from '@livedoc/pdf-documents';
import {
  leastCorners,
  polyDraftShape,
  polyShapeOf,
  pressCorner,
  takeBackCorner,
  type PolyDraft,
} from './pdf-poly';

const at = (x: number, y: number) => ({ x, y });
const press = (x: number, y: number, index = 0) => ({ index, at: at(x, y), reach: 4 });
const draft = (kind: PolyDraft['kind'], ...corners: [number, number][]): PolyDraft => ({
  kind,
  page: 0,
  corners: corners.map(([x, y]) => at(x, y)),
});
const LINE = { width: 2 };

describe('pressCorner', () => {
  it('begins a shape at the first press and adds a corner at each press after', () => {
    const first = pressCorner('polygon', null, press(10, 10));
    expect(first).toEqual({ draft: draft('polygon', [10, 10]), ended: null });
    const second = pressCorner('polygon', first.draft, press(50, 10));
    expect(second.draft?.corners).toEqual([at(10, 10), at(50, 10)]);
    expect(second.ended).toBeNull();
  });

  it('adds no corner for a press within PDF_SHAPE_MIN_PT of the last', () => {
    const was = draft('polyline', [10, 10], [50, 10]);
    expect(pressCorner('polyline', was, press(51, 10))).toEqual({ draft: was, ended: null });
  });

  it('closes a Polygon or a Cloud of 3 corners or more by a press on its first corner', () => {
    const was = draft('cloud', [10, 10], [50, 10], [30, 40]);
    expect(pressCorner('cloud', was, press(12, 11))).toEqual({ draft: null, ended: was });
    const two = draft('polygon', [10, 10], [50, 10]);
    expect(pressCorner('polygon', two, press(12, 11)).ended).toBeNull();
  });

  it('never closes Connected lines on their first corner: the press is a corner', () => {
    const was = draft('polyline', [10, 10], [50, 10], [30, 40]);
    const pressed = pressCorner('polyline', was, press(10, 12));
    expect(pressed.ended).toBeNull();
    expect(pressed.draft?.corners).toHaveLength(4);
  });

  it('begins afresh on another page, or for another kind, letting the shape so far go', () => {
    const was = draft('polygon', [10, 10], [50, 10]);
    expect(pressCorner('polygon', was, press(5, 5, 1))).toEqual({
      draft: { kind: 'polygon', page: 1, corners: [at(5, 5)] },
      ended: null,
    });
    expect(pressCorner('cloud', was, press(5, 5)).draft).toEqual(draft('cloud', [5, 5]));
  });

  it('ends the shape at the corner that reaches PDF_POLYGON_MAX_CORNERS', () => {
    const corners = Array.from({ length: PDF_POLYGON_MAX_CORNERS - 1 }, (_, n) => at(n * 3, 0));
    const was: PolyDraft = { kind: 'polyline', page: 0, corners };
    const pressed = pressCorner('polyline', was, press(0, 100));
    expect(pressed.draft).toBeNull();
    expect(pressed.ended?.corners).toHaveLength(PDF_POLYGON_MAX_CORNERS);
  });
});

describe('takeBackCorner', () => {
  it('takes the last corner back, and the shape with its only one', () => {
    expect(takeBackCorner(draft('polygon', [1, 1], [9, 9]))).toEqual(draft('polygon', [1, 1]));
    expect(takeBackCorner(draft('polygon', [1, 1]))).toBeNull();
  });
});

describe('polyShapeOf', () => {
  it('is the corners in the tool’s line, a fill only inside a Polygon or a Cloud', () => {
    const line = { width: 3, lineStyle: 'dashed' as const, fill: '#fde293' };
    expect(polyShapeOf(draft('polygon', [0, 0], [9, 0], [0, 9]), line)).toEqual({
      kind: 'polygon',
      corners: [0, 0, 9, 0, 0, 9],
      width: 3,
      lineStyle: 'dashed',
      fill: '#fde293',
    });
    expect(polyShapeOf(draft('polyline', [0, 0], [9, 0]), line)).toEqual({
      kind: 'polyline',
      corners: [0, 0, 9, 0],
      width: 3,
      lineStyle: 'dashed',
    });
  });

  it('is nothing for fewer corners than the kind’s least', () => {
    expect(leastCorners('polygon')).toBe(3);
    expect(leastCorners('polyline')).toBe(2);
    expect(polyShapeOf(draft('cloud', [0, 0], [9, 0]), LINE)).toBeNull();
    expect(polyShapeOf(draft('polyline', [0, 0]), LINE)).toBeNull();
  });
});

describe('polyDraftShape', () => {
  it('runs on to the pointer, open until a Polygon has corners enough', () => {
    const was = draft('polygon', [0, 0], [20, 0]);
    expect(polyDraftShape(draft('polygon', [0, 0]), at(20, 0), LINE)).toEqual({
      kind: 'polyline',
      corners: [0, 0, 20, 0],
      width: 2,
    });
    expect(polyDraftShape(was, at(10, 20), { ...LINE, fill: '#fde293' })).toEqual({
      kind: 'polygon',
      corners: [0, 0, 20, 0, 10, 20],
      width: 2,
      fill: '#fde293',
    });
  });

  it('shows nothing for a lone corner, and no extra corner for a pointer on the last', () => {
    expect(polyDraftShape(draft('cloud', [0, 0]), null, LINE)).toBeNull();
    expect(polyDraftShape(draft('cloud', [0, 0]), at(1, 0), LINE)).toBeNull();
    expect(polyDraftShape(draft('polyline', [0, 0], [20, 0]), at(20, 1), LINE)?.corners).toEqual([
      0, 0, 20, 0,
    ]);
  });
});
