// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createShape, type Element, type ShapeElement } from '@livedoc/document';
import { MindHaloRootsProvider } from './MindMapLayer';
import { MindRootHalo } from './MindRootHalo';

// docs/specs/009-elements/mind-node.md "The root's halo": the canvas rings a root with a child, and only that.

afterEach(() => cleanup());

const node = (id: string, parent?: string): ShapeElement => ({
  ...createShape('mind-node', 100, 50),
  id,
  width: 200,
  height: 60,
  strokeWidth: 'thin',
  ...(parent ? { mindParentId: parent } : {}),
});

const draw = (elements: Element[], id: string, stroke = '#1e293b') =>
  render(
    <MindHaloRootsProvider elements={elements}>
      <MindRootHalo
        node={elements.find((e) => e.id === id) as ShapeElement}
        cornerPx={12}
        stroke={stroke}
        surface="light"
        finish="flexible"
      />
    </MindHaloRootsProvider>,
  ).container.querySelector<HTMLElement>('[data-mind-halo]');

describe('MindRootHalo', () => {
  const map: Element[] = [node('r'), node('a', 'r')];

  it('rings the root a clear 6 px outside its edge, taking no pointer', () => {
    const halo = draw(map, 'r')!;

    expect(halo.getAttribute('aria-hidden')).toBe('true');
    expect(halo.className).toContain('pointer-events-none');
    // The ring's line (1.5 px) starts 6 px out from the node's edge.
    expect(halo.style.left).toBe('-7.5px');
    expect(halo.style.width).toBe('215px');
    expect(halo.style.borderRadius).toBe('19.5px');
    expect(halo.style.border).toContain('1.5px solid');
  });

  it("is drawn in the root's border colour, lifted where the paper cannot carry it", () => {
    expect(draw(map, 'r')!.style.borderColor).toBe('rgb(30, 41, 59)');
    cleanup();
    expect(draw(map, 'r', '#f1f5f9')!.style.borderColor).not.toBe('rgb(241, 245, 249)');
  });

  it('leaves a child, and a lone node, plain', () => {
    expect(draw(map, 'a')).toBeNull();
    cleanup();
    expect(draw([node('lone')], 'lone')).toBeNull();
  });
});
