import { beforeAll, describe, expect, it } from 'vitest';
import {
  createPinnedArrow,
  createShape,
  type ArrowElement,
  type Element,
  type ShapeElement,
} from '@livedoc/document';
import { morphShapes } from './shape-morph';
import { loadEveryKindFamily } from '@/lib/element-kinds/load-every-family';

// Mind maps draw and edit through their family (lib/element-kinds), in as after the board's idle prefetch.
beforeAll(loadEveryKindFamily);

// docs/specs/009-elements/mind-node.md "Converting a flow": boxes joined by arrows, converted to mind nodes, are a
// mind map; docs/specs/008-canvas/canvas-and-palette.md "Shape": every other morph is the element alone.

const square = (id: string, x: number, y: number): ShapeElement => ({
  ...createShape('square', x, y),
  id,
  width: 100,
  height: 40,
});
const arrow = (from: string, to: string): ArrowElement => ({
  ...createPinnedArrow(from, 's', to, 'n'),
  id: `${from}>${to}`,
});
const get = (els: Element[], id: string) => els.find((e) => e.id === id) as ShapeElement;

const flow = (): Element[] => [
  square('r', 0, 0),
  square('a', 0, 200),
  square('b', 300, 200),
  arrow('r', 'a'),
  arrow('r', 'b'),
];

describe('morphShapes', () => {
  it('turns a converted flow into a mind map in the same change', () => {
    const out = morphShapes(flow(), new Set(['r', 'a', 'b']), 'mind-node');

    expect(get(out, 'a')).toMatchObject({ shape: 'mind-node', mindParentId: 'r' });
    expect(get(out, 'b')).toMatchObject({ shape: 'mind-node', mindParentId: 'r' });
    expect(get(out, 'r').mindFlow).toBe('downward');
  });

  it('converts only what it is given, joining it to mind nodes it is drawn to', () => {
    const first = morphShapes(flow(), new Set(['r']), 'mind-node');
    expect(get(first, 'a').shape).toBe('square');

    const out = morphShapes(first, new Set(['a']), 'mind-node');

    expect(get(out, 'a').mindParentId).toBe('r');
    expect(get(out, 'b').shape).toBe('square');
  });

  it('morphs into any other kind element by element, joining nothing', () => {
    const out = morphShapes(flow(), new Set(['r', 'a']), 'circle');

    expect(get(out, 'r').shape).toBe('circle');
    expect(get(out, 'a').shape).toBe('circle');
    expect(get(out, 'b').shape).toBe('square');
  });

  it('leaves a mind node morphed into a mind node as it is', () => {
    const els = morphShapes(flow(), new Set(['r', 'a', 'b']), 'mind-node');

    expect(morphShapes(els, new Set(['a']), 'mind-node')).toEqual(els);
  });
});
