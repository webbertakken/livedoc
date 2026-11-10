import { describe, expect, it } from 'vitest';
import { createShape } from './factories';
import {
  MIND_BRANCH_FLOWS,
  isMindSide,
  mindBranchFlowOf,
  mindOwnFlow,
  mindSideByPosition,
  mindNewChildSide,
  mindSideOf,
} from './mind-direction';
import type { MindFlow } from './mind-flow';
import type { Element, ShapeElement } from './index';

// docs/specs/009-elements/mind-node.md "A direction per node": every node holds the direction its own children grow
// in; a deeper node holding none follows its parent.

const node = (
  id: string,
  x: number,
  y: number,
  parent?: string,
  flow?: MindFlow,
): ShapeElement => ({
  ...createShape('mind-node', x, y),
  id,
  width: 100,
  height: 40,
  ...(parent ? { mindParentId: parent } : {}),
  ...(flow ? { mindFlow: flow } : {}),
});

const byId = (els: Element[], id: string) => els.find((e) => e.id === id) as ShapeElement;

describe('mindOwnFlow', () => {
  it("reads a root's map flow, Tree when it holds none", () => {
    expect(mindOwnFlow(node('r', 0, 0), true)).toBe('tree');
    expect(mindOwnFlow(node('r', 0, 0, undefined, 'bubble'), true)).toBe('bubble');
  });

  it('reads a deeper node holding none, or a root-only flow, as Auto', () => {
    expect(mindOwnFlow(node('a', 0, 0, 'r'), false)).toBeNull();
    expect(mindOwnFlow(node('a', 0, 0, 'r', 'balanced'), false)).toBeNull();
    expect(mindOwnFlow(node('a', 0, 0, 'r', 'bubble'), false)).toBeNull();
    for (const flow of MIND_BRANCH_FLOWS)
      expect(mindOwnFlow(node('a', 0, 0, 'r', flow), false)).toBe(flow);
  });
});

describe('mindSideByPosition', () => {
  const parent = node('p', 0, 0);
  it('takes the side the child is further out on', () => {
    expect(mindSideByPosition(parent, node('c', 200, 10))).toBe('tree');
    expect(mindSideByPosition(parent, node('c', -200, 10))).toBe('leftward');
    expect(mindSideByPosition(parent, node('c', 10, 200))).toBe('downward');
    expect(mindSideByPosition(parent, node('c', 10, -200))).toBe('upward');
    // A tie goes across, and a child on the parent's centre to the right.
    expect(mindSideByPosition(parent, node('c', 0, 0))).toBe('tree');
  });
});

describe('mindBranchFlowOf and mindSideOf', () => {
  it('follows the parent down a branch holding no directions', () => {
    const els: Element[] = [
      node('r', 0, 0, undefined, 'upward'),
      node('a', 0, -200, 'r'),
      node('aa', 0, -400, 'a'),
    ];
    expect(mindBranchFlowOf(els, byId(els, 'aa'))).toBe('upward');
    expect(mindSideOf(els, byId(els, 'aa'))).toBe('upward');
  });

  it('lets a branch hold its own direction, and its children follow it', () => {
    const els: Element[] = [
      node('r', 0, 0, undefined, 'upward'),
      node('a', 0, -200, 'r', 'leftward'),
      node('aa', -200, -200, 'a'),
    ];
    // `a` sits above its root and grows left.
    expect(mindSideOf(els, byId(els, 'a'))).toBe('upward');
    expect(mindBranchFlowOf(els, byId(els, 'a'))).toBe('leftward');
    expect(mindSideOf(els, byId(els, 'aa'))).toBe('leftward');
    expect(mindBranchFlowOf(els, byId(els, 'aa'))).toBe('leftward');
  });

  it("puts an any-direction parent's children on their own sides", () => {
    const els: Element[] = [
      node('r', 0, 0, undefined, 'any'),
      node('up', 0, -200, 'r', 'upward'),
      node('left', -200, 0, 'r', 'leftward'),
      node('right', 200, 0, 'r', 'tree'),
      // Holding none (or Any itself), a child sits where it is drawn.
      node('below', 0, 200, 'r'),
      node('free', 0, -400, 'r', 'any'),
    ];
    expect(
      ['up', 'left', 'right', 'below', 'free'].map((id) => mindSideOf(els, byId(els, id))),
    ).toEqual(['upward', 'leftward', 'tree', 'downward', 'upward']);
    expect(mindBranchFlowOf(els, byId(els, 'below'))).toBe('downward');
    expect(mindBranchFlowOf(els, byId(els, 'free'))).toBe('any');
  });

  it("puts a balanced root's branches on the side they are drawn, and they grow that way", () => {
    const els: Element[] = [
      node('r', 0, 0, undefined, 'balanced'),
      node('l', -200, 0, 'r'),
      node('ll', -400, 0, 'l'),
      node('rr', 200, 0, 'r'),
    ];
    expect(mindSideOf(els, byId(els, 'l'))).toBe('leftward');
    expect(mindBranchFlowOf(els, byId(els, 'll'))).toBe('leftward');
    expect(mindSideOf(els, byId(els, 'rr'))).toBe('tree');
  });

  it('reads a bubble map as a whole: no sides, every node bubble', () => {
    const els: Element[] = [
      node('r', 0, 0, undefined, 'bubble'),
      node('a', 200, 0, 'r', 'upward'),
      node('aa', 400, 0, 'a'),
    ];
    expect(mindSideOf(els, byId(els, 'a'))).toBeNull();
    expect(mindBranchFlowOf(els, byId(els, 'aa'))).toBe('bubble');
    expect(mindBranchFlowOf(els, byId(els, 'r'))).toBe('bubble');
  });

  it('gives a root no side and stops at a cycle', () => {
    const els: Element[] = [node('a', 0, 0, 'b', 'upward'), node('b', 0, -200, 'a')];
    expect(mindSideOf(els, node('r', 0, 0))).toBeNull();
    // The walk stops where the parents repeat: `a` reads as the root there.
    expect(mindBranchFlowOf(els, byId(els, 'a'))).toBe('upward');
    expect(mindBranchFlowOf(els, byId(els, 'b'))).toBe('upward');
  });

  it('knows the four sides', () => {
    expect(['tree', 'leftward', 'downward', 'upward'].every(isMindSide)).toBe(true);
    expect(isMindSide('any')).toBe(false);
    expect(isMindSide(undefined)).toBe(false);
  });
});

describe('mindNewChildSide', () => {
  const anyRoot = (): Element[] => [
    node('r', 0, 0, undefined, 'any'),
    node('up', 0, -200, 'r', 'upward'),
    node('left', -200, 0, 'r', 'leftward'),
  ];

  it("takes the side of an any-direction parent's last added child", () => {
    expect(mindNewChildSide(anyRoot(), byId(anyRoot(), 'r'))).toBe('leftward');
  });

  it('takes the side of the sibling Enter was pressed on', () => {
    const els = anyRoot();
    expect(mindNewChildSide(els, byId(els, 'r'), byId(els, 'up'))).toBe('upward');
  });

  it('goes right off an any-direction parent with no children', () => {
    const els: Element[] = [node('r', 0, 0, undefined, 'any')];
    expect(mindNewChildSide(els, byId(els, 'r'))).toBe('tree');
  });

  it('holds no side under any other parent: the child follows it', () => {
    const els: Element[] = [node('r', 0, 0, undefined, 'upward'), node('a', 0, -200, 'r')];
    expect(mindNewChildSide(els, byId(els, 'r'))).toBeNull();
    expect(mindNewChildSide(els, byId(els, 'a'))).toBeNull();
  });
});
