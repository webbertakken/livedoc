// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { memo } from 'react';
import { describe, expect, it } from 'vitest';
import { createShape, type Element, type ShapeElement } from '@livedoc/document';
import { MindNumbersProvider, useMindNumber } from './MindMapLayer';

// docs/specs/008-canvas/canvas-performance.md "A move re-renders what moved": the mind numbering every
// element view reads keeps its identity while the numbers hold, so a document change elsewhere (a
// released drag) re-renders no element view through it.

const node = (id: string, parent?: string, numbered = false): ShapeElement => ({
  ...createShape('mind-node', 0, 0),
  id,
  ...(parent ? { mindParentId: parent } : {}),
  ...(numbered ? { mindNumbered: true } : {}),
});

const renders = new Map<string, number>();
const NumberReader = memo(function NumberReader({ id }: { id: string }) {
  renders.set(id, (renders.get(id) ?? 0) + 1);
  return <span data-number={id}>{useMindNumber(id) ?? ''}</span>;
});

function Board({ elements }: { elements: Element[] }) {
  return (
    <MindNumbersProvider elements={elements}>
      {elements.map((el) => (
        <NumberReader key={el.id} id={el.id} />
      ))}
    </MindNumbersProvider>
  );
}

const moved = (els: Element[], id: string): Element[] =>
  els.map((el) => (el.id === id ? { ...el, x: (el as ShapeElement).x + 40 } : el));

describe('MindNumbersProvider', () => {
  it('re-renders no reader when a board without numbered nodes changes', () => {
    renders.clear();
    const els: Element[] = [createShape('square', 0, 0), createShape('square', 300, 0)];
    const { rerender } = render(<Board elements={els} />);
    rerender(<Board elements={moved(els, els[0]!.id)} />);
    expect([...renders.values()]).toEqual([1, 1]);
  });

  it('re-renders no reader when a change leaves the numbers as they were', () => {
    renders.clear();
    const els: Element[] = [node('r'), node('a', 'r', true), node('b', 'r', true)];
    const { rerender } = render(<Board elements={els} />);
    rerender(<Board elements={moved(els, 'r')} />);
    expect(Object.fromEntries(renders)).toEqual({ r: 1, a: 1, b: 1 });
  });

  it('shows the new numbers when they change', () => {
    const els: Element[] = [node('r'), node('a', 'r', true), node('b', 'r')];
    const { container, rerender } = render(<Board elements={els} />);
    const numberOf = (id: string) => container.querySelector(`[data-number="${id}"]`)!.textContent;
    expect([numberOf('a'), numberOf('b')]).toEqual(['1', '']);
    rerender(<Board elements={[els[0]!, els[1]!, node('b', 'r', true)]} />);
    expect([numberOf('a'), numberOf('b')]).toEqual(['1', '2']);
  });
});
