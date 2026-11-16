import { describe, expect, it } from 'vitest';
import { contrastRatio } from './colour-math';
import { DARK_CANVAS_BACKGROUND_COLOR, DEFAULT_BACKGROUND_COLOR } from './canvas-colors';
import { createShape } from './factories';
import {
  MIND_HALO_GAP,
  MIND_HALO_MIN_CONTRAST,
  MIND_HALO_MIN_WIDTH,
  mindHaloRing,
  mindHaloRoots,
  mindHaloStroke,
  svgMindHalo,
} from './mind-halo';
import type { Element, ShapeElement } from './index';

// docs/specs/009-elements/mind-node.md "The root's halo": a second outline round every root with a child, worked out
// from the tree, in the root's border colour at a contrast the paper can carry.

const node = (id: string, parent?: string, more: Partial<ShapeElement> = {}): ShapeElement => ({
  ...createShape('mind-node', 100, 50),
  id,
  width: 200,
  height: 60,
  ...(parent ? { mindParentId: parent } : {}),
  ...more,
});

describe('mindHaloRoots', () => {
  it('rings a root with a child, and none of the nodes under it', () => {
    const els: Element[] = [node('r'), node('a', 'r'), node('b', 'a')];

    expect([...mindHaloRoots(els)]).toEqual(['r']);
  });

  it('leaves a lone node plain', () => {
    expect(mindHaloRoots([node('r')]).size).toBe(0);
  });

  it('rings every map on the canvas', () => {
    const els: Element[] = [node('r1'), node('a', 'r1'), node('r2'), node('b', 'r2'), node('lone')];

    expect([...mindHaloRoots(els)].sort()).toEqual(['r1', 'r2']);
  });

  it('follows the root when the tree changes: a node under a new parent hands the halo up', () => {
    const before: Element[] = [node('r'), node('a', 'r')];
    const after: Element[] = [node('top'), node('r', 'top'), node('a', 'r')];

    expect([...mindHaloRoots(before)]).toEqual(['r']);
    expect([...mindHaloRoots(after)]).toEqual(['top']);
  });

  it('rings a node whose parent is gone, as the root it now is, and ignores other elements', () => {
    const box: Element = { ...createShape('square', 0, 0), id: 'box' };
    const els: Element[] = [node('a', 'gone'), node('b', 'a'), box, node('c', 'box')];

    expect([...mindHaloRoots(els)]).toEqual(['a']);
  });

  it('rings no node in a loop of parents, where none is a root', () => {
    expect(mindHaloRoots([node('a', 'b'), node('b', 'a')]).size).toBe(0);
  });
});

describe('mindHaloRing', () => {
  it('sits a clear gap outside the node, its corners parallel to the node', () => {
    const ring = mindHaloRing(node('r', undefined, { strokeWidth: 'thin' }), 12, 'flexible');
    const half = MIND_HALO_MIN_WIDTH / 2;

    expect(ring).toEqual({
      x: 100 - MIND_HALO_GAP - half,
      y: 50 - MIND_HALO_GAP - half,
      width: 200 + 2 * (MIND_HALO_GAP + half),
      height: 60 + 2 * (MIND_HALO_GAP + half),
      radius: 12 + MIND_HALO_GAP + half,
      strokeWidth: MIND_HALO_MIN_WIDTH,
    });
  });

  it("is as wide as a thicker border, and 1.5 px for a borderless node's", () => {
    expect(
      mindHaloRing(node('r', undefined, { strokeWidth: 'thick' }), 12, 'flexible').strokeWidth,
    ).toBe(4);
    expect(
      mindHaloRing(node('r', undefined, { strokeWidth: 'none' }), 12, 'flexible').strokeWidth,
    ).toBe(MIND_HALO_MIN_WIDTH);
  });
});

describe('mindHaloStroke', () => {
  it("keeps the root's border colour when the paper carries it", () => {
    expect(mindHaloStroke('#1e293b', 'light')).toBe('#1e293b');
    expect(mindHaloStroke('#e2e8f0', 'dark')).toBe('#e2e8f0');
  });

  it.each([
    ['#f1f5f9', 'light', DEFAULT_BACKGROUND_COLOR],
    ['#fde68a', 'light', DEFAULT_BACKGROUND_COLOR],
    ['#1e293b', 'dark', DARK_CANVAS_BACKGROUND_COLOR],
    ['#334155', 'dark', DARK_CANVAS_BACKGROUND_COLOR],
  ] as const)('lifts %s on the %s paper to the contrast it needs', (stroke, surface, paper) => {
    const out = mindHaloStroke(stroke, surface);

    expect(out).not.toBe(stroke);
    expect(contrastRatio(out, paper)).toBeGreaterThanOrEqual(MIND_HALO_MIN_CONTRAST);
  });

  it('leaves a colour it cannot read as it is', () => {
    expect(mindHaloStroke('currentColor', 'light')).toBe('currentColor');
  });
});

describe('svgMindHalo', () => {
  it('draws the ring as an unfilled rect in the halo colour', () => {
    const svg = svgMindHalo(
      node('r', undefined, { strokeWidth: 'thin' }),
      12,
      'light',
      'flexible',
      '#1e293b',
    );

    expect(svg).toContain('<rect');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="#1e293b"');
    expect(svg).toContain(`rx="${12 + MIND_HALO_GAP + MIND_HALO_MIN_WIDTH / 2}"`);
  });
});
