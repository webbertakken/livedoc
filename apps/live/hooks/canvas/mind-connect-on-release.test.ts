import { describe, expect, it } from 'vitest';
import { createPinnedArrow, createShape, type Element, type ShapeElement } from '@livedoc/document';
import { mindConnectionOnRelease } from './mind-connect-on-release';

// docs/specs/009-elements/mind-node.md "Connecting nodes": a released connector builds the tree, dressed as one.

const node = (id: string, x: number): ShapeElement => ({
  ...createShape('mind-node', x, 0),
  id,
  mindFlow: 'tree',
});
const drawn = { ...createPinnedArrow('a', 'e', 'b', 'w'), id: 'drawn', arrowEnds: 'to' as const };

describe('mindConnectionOnRelease', () => {
  it('makes the connected node a child, the connector a curved line with no heads', () => {
    const els: Element[] = [node('a', 0), node('b', 600), drawn];
    const out = mindConnectionOnRelease([], 'drawn', false)(els);
    expect(out.find((e) => e.id === 'b')).toMatchObject({ mindParentId: 'a' });
    expect(out.find((e) => e.id === 'drawn')).toMatchObject({
      arrowEnds: 'none',
      arrowStyle: 'curved',
    });
  });

  it('changes nothing for a connector between other things', () => {
    const els: Element[] = [node('a', 0), { ...createShape('square', 600, 0), id: 'b' }, drawn];
    expect(mindConnectionOnRelease([], 'drawn', false)(els)).toBe(els);
  });
});
