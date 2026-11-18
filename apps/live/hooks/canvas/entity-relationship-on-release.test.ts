import { afterEach, describe, expect, it } from 'vitest';
import { createShape, type ArrowElement, type Element } from '@livedoc/document';
import { loadEveryKindFamily } from '@/lib/element-kinds/load-every-family';
import { resetKindFamiliesForTests } from '@/lib/element-kinds/store';
import { relationshipOnRelease } from './entity-relationship-on-release';

// docs/specs/009-elements/entity.md "Cardinality ends": a released arrow between two entities becomes a relationship,
// through the entities family (docs/specs/016-platform/web-performance.md).
const left = { ...createShape('entity', 0, 0), id: 'l' };
const right = { ...createShape('entity', 400, 0), id: 'r' };
const arrow: ArrowElement = {
  id: 'a',
  type: 'arrow',
  from: { kind: 'pinned', elementId: 'l', anchor: 'e' },
  to: { kind: 'pinned', elementId: 'r', anchor: 'w' },
};
const board: Element[] = [left, right, arrow];

afterEach(() => resetKindFamiliesForTests());

describe('relationshipOnRelease', () => {
  it('gives an arrow joining two entities its relationship ends', async () => {
    await loadEveryKindFamily();
    const next = relationshipOnRelease('a')(board);
    expect(next[2]).toMatchObject({
      arrowEnds: 'both',
      arrowheadStartShape: 'one',
      arrowheadShape: 'many',
    });
  });

  it('leaves the board as it is while the family is not in', () => {
    expect(relationshipOnRelease('a')(board)).toBe(board);
  });
});
