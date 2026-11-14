import { describe, expect, it } from 'vitest';
import { mapPictures } from './minimap-pictures';

// docs/specs/008-canvas/canvas-performance.md "The Map is a few pictures".

const OPEN = '<svg xmlns="http://www.w3.org/2000/svg">';
const docOf = (href: string) => decodeURIComponent(href.slice(href.indexOf(',') + 1));
const boxes = (n: number, tag = 'b') =>
  Array.from({ length: n }, (_, i) => `<rect id="${tag}${i}"/>`);

describe('mapPictures', () => {
  it('cuts each section into pictures of at most so many elements, in paint order', () => {
    const pictures = mapPictures(
      [
        { key: 'b', parts: boxes(5) },
        { key: 'a', parts: boxes(2, 'a') },
      ],
      OPEN,
      2,
    );
    expect(pictures.map((p) => p.key)).toEqual(['b0', 'b1', 'b2', 'a0']);
    expect(pictures.map((p) => docOf(p.href))).toEqual([
      `${OPEN}<rect id="b0"/><rect id="b1"/></svg>`,
      `${OPEN}<rect id="b2"/><rect id="b3"/></svg>`,
      `${OPEN}<rect id="b4"/></svg>`,
      `${OPEN}<rect id="a0"/><rect id="a1"/></svg>`,
    ]);
  });

  it('redraws only the picture holding a changed element', () => {
    const parts = boxes(6);
    const before = mapPictures([{ key: 'b', parts }], OPEN, 2);
    const moved = parts.map((p, i) => (i === 3 ? '<rect id="b3" x="9"/>' : p));
    const after = mapPictures([{ key: 'b', parts: moved }], OPEN, 2);
    expect(after.map((p, i) => p.href === before[i]!.href)).toEqual([true, false, true]);
  });

  it("leaves the arrows' pictures as they were when a box is added", () => {
    const arrows = { key: 'a', parts: boxes(3, 'a') };
    const before = mapPictures([{ key: 'b', parts: boxes(4) }, arrows], OPEN, 2);
    const after = mapPictures([{ key: 'b', parts: boxes(5) }, arrows], OPEN, 2);
    const byKey = (ps: typeof before) => new Map(ps.map((p) => [p.key, p.href]));
    expect(byKey(after).get('a0')).toBe(byKey(before).get('a0'));
    expect(byKey(after).get('a1')).toBe(byKey(before).get('a1'));
    expect(after.map((p) => p.key)).toEqual(['b0', 'b1', 'b2', 'a0', 'a1']);
  });

  it('draws nothing for an empty board', () => {
    expect(mapPictures([{ key: 'b', parts: [] }], OPEN)).toEqual([]);
  });
});
