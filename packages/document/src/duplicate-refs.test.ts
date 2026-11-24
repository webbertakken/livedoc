import { describe, expect, it } from 'vitest';
import type { ArrowElement, Element, ShapeElement } from './index';
import { remapElementRefs, remapTabLinks, withTabLinksRemapped } from './duplicate';

const shape = (id: string, extra: Partial<ShapeElement> = {}): ShapeElement =>
  ({
    id,
    type: 'shape',
    kind: 'rectangle',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...extra,
  }) as ShapeElement;

describe('remapElementRefs', () => {
  it('follows pinned, on-arrow, mind-parent and portal references in the map', () => {
    const arrow = {
      id: 'a1',
      type: 'arrow',
      from: { kind: 'pinned', elementId: 's1', anchor: 'e' },
      to: { kind: 'on-arrow', arrowId: 'a0', t: 0.5 },
    } as ArrowElement;
    const els: Element[] = [shape('s2', { mindParentId: 's1', portalTarget: 's1' }), arrow];
    const out = remapElementRefs(
      els,
      new Map([
        ['s1', 'S1'],
        ['a0', 'A0'],
      ]),
    );
    expect(out[0]).toMatchObject({ mindParentId: 'S1', portalTarget: 'S1' });
    expect((out[1] as ArrowElement).from).toMatchObject({ elementId: 'S1' });
    expect((out[1] as ArrowElement).to).toMatchObject({ arrowId: 'A0' });
  });

  it("follows an attached badge's host, as a duplicated or imported tab re-mints both", () => {
    const badge = shape('b1', { shape: 'badge', attachedTo: 's1', attachAt: 'top-right' });
    const [out] = remapElementRefs([badge], new Map([['s1', 'S1']]));
    expect(out).toMatchObject({ attachedTo: 'S1', attachAt: 'top-right' });
  });

  it('leaves references outside the map, and element links, alone', () => {
    const el = shape('s2', {
      mindParentId: 'other',
      link: { kind: 'element', tabId: 't', elementId: 's1' },
    });
    const [out] = remapElementRefs([el], new Map([['s1', 'S1']]));
    expect(out).toBe(el);
  });
});

describe('remapTabLinks', () => {
  it('re-points tab and element links, keeps document and url links', () => {
    const els: Element[] = [
      shape('a', { link: { kind: 'tab', tabId: 't1' } }),
      shape('b', { link: { kind: 'element', tabId: 't1', elementId: 'a' } }),
      shape('c', { link: { kind: 'document', documentId: 'd', name: 'D' } }),
      shape('d', { link: { kind: 'url', url: 'https://x' } }),
      shape('e', { link: { kind: 'tab', tabId: 'elsewhere' } }),
    ];
    const out = remapTabLinks(els, new Map([['t1', 'T1']]));
    expect(out.map((e) => e.link)).toEqual([
      { kind: 'tab', tabId: 'T1' },
      { kind: 'element', tabId: 'T1', elementId: 'a' },
      { kind: 'document', documentId: 'd', name: 'D' },
      { kind: 'url', url: 'https://x' },
      { kind: 'tab', tabId: 'elsewhere' },
    ]);
  });
});

describe('withTabLinksRemapped', () => {
  // docs/specs/034-text-documents/objects.md "Copying": a drawing tab is re-pointed at the copy's text document tab.
  it('re-points a drawing tab at the copy of its text document tab, with its links', () => {
    const tab = {
      id: 'd1',
      name: 'Drawing 1',
      drawingOf: 't1',
      elements: [shape('a', { link: { kind: 'tab', tabId: 't1' } })] as Element[],
    };
    const out = withTabLinksRemapped(tab, new Map([['t1', 'T1']]));
    expect(out.drawingOf).toBe('T1');
    expect(out.elements[0]!.link).toEqual({ kind: 'tab', tabId: 'T1' });
    expect(out.id).toBe('d1');
  });

  it('keeps a drawingOf the copy does not hold, and adds none to a tab without one', () => {
    const map = new Map([['t1', 'T1']]);
    expect(withTabLinksRemapped({ id: 'd', drawingOf: 'x', elements: [] }, map).drawingOf).toBe(
      'x',
    );
    expect('drawingOf' in withTabLinksRemapped({ id: 'b', elements: [] }, map)).toBe(false);
  });
});
