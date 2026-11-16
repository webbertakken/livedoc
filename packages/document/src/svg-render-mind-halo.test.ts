import { describe, expect, it } from 'vitest';
import { renderElementsToSvg, svgBoxed } from './svg-render';
import type { ShapeElement, Tab } from './index';

// docs/specs/009-elements/mind-node.md "The root's halo": the export draws the halo the canvas draws.

const node = (id: string, o: Partial<ShapeElement> = {}): ShapeElement => ({
  id,
  type: 'shape',
  shape: 'mind-node',
  x: 0,
  y: 0,
  width: 200,
  height: 60,
  strokeColor: '#1e293b',
  ...o,
});
const tab = (elements: Tab['elements']): Tab => ({ id: 't', name: 'T', elements });
// Each tag on its own, no backtracking pattern: the halo is the unfilled rect in the node's border colour.
const halos = (svg: string) =>
  svg
    .split('<')
    .filter((tag) => tag.startsWith('rect ') && tag.includes('fill="none" stroke="#1e293b"'));

describe('the exported halo', () => {
  it('rings the root of a map, and not its children', () => {
    const svg = renderElementsToSvg(tab([node('r'), node('a', { mindParentId: 'r', y: 200 })]));

    expect(halos(svg)).toHaveLength(1);
    expect(halos(svg)[0]).toContain('x="-7"');
  });

  it('leaves a lone node plain', () => {
    expect(halos(renderElementsToSvg(tab([node('r')])))).toHaveLength(0);
  });

  it('draws the halo under the node, inside its group', () => {
    const svg = svgBoxed(node('r'), { mindHalo: true });

    expect(svg.startsWith('<g')).toBe(true);
    expect(svg.indexOf('fill="none" stroke="#1e293b"')).toBeLessThan(svg.indexOf('fill="#'));
  });

  it('draws nothing extra for a shape that is not a mind node', () => {
    const square = { ...node('s'), shape: 'square' as const };

    expect(svgBoxed(square, { mindHalo: true })).toBe(svgBoxed(square));
  });
});
