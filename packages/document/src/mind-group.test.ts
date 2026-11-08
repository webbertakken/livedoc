import { describe, expect, it } from 'vitest';
import { createShape } from './factories';
import { applyMindMoves, relayoutMindMap } from './mind-grow';
import { groupMindNodes, planMindDrop, setMindNumbered, ungroupMindNodes } from './mind-arrange';
import { relayoutAfterRemoval } from './mind-connect';
import { isMindGroupFrame, settleMindGroups } from './mind-group';
import { MIND_GROUP_PADDING, MIND_GROUP_TITLE_BAND, isMindTreeTidy } from './mind-layout';
import { LABEL_LINE_HEIGHT } from './svg-render-primitives';
import { labelFontPx } from './label-font';
import { PADDING_PX, type Element, type ShapeElement } from './index';

// docs/specs/009-elements/mind-node.md "Groups": a group is a titled frame around its members.

const node = (id: string, parent?: string): ShapeElement => ({
  ...createShape('mind-node', 0, 0),
  id,
  width: 200,
  height: 60,
  ...(parent ? { mindParentId: parent } : { mindFlow: 'tree' as const, x: 100, y: 400 }),
});

function tidy(): Element[] {
  const els: Element[] = [
    node('r'),
    node('a', 'r'),
    node('b', 'r'),
    node('c', 'r'),
    node('d', 'r'),
  ];
  const stacked = els.map((e, i) => (e.id === 'r' ? e : { ...e, y: i * 100 })) as Element[];
  const plan = relayoutMindMap(stacked, 'r')!;
  return applyMindMoves(stacked, plan.moves, plan.reanchored);
}
const get = (els: Element[], id: string) => els.find((e) => e.id === id) as ShapeElement;

describe('a group is a frame', () => {
  it('is made untitled, titled at its top left, around its members with room for the title', () => {
    const out = groupMindNodes(tidy(), new Set(['b', 'c']), 'g');
    const frame = get(out, 'g');
    expect(isMindGroupFrame(frame)).toBe(true);
    expect(frame).toMatchObject({
      shape: 'frame',
      label: '',
      textAlignX: 'left',
      textAlignY: 'top',
    });
    const b = get(out, 'b');
    expect(frame.x).toBe(b.x - MIND_GROUP_PADDING);
    expect(frame.y).toBe(b.y - MIND_GROUP_PADDING - MIND_GROUP_TITLE_BAND);
    // The title's band is room the layout gives too: a's bottom clears the frame's top.
    const a = get(out, 'a');
    expect(a.y + a.height).toBeLessThan(frame.y);
    expect(isMindTreeTidy(out, 'r', 'tree')).toBe(true);
  });

  it('insets its title as far as its members, and leaves that much again under the title', () => {
    const frame = get(groupMindNodes(tidy(), new Set(['b', 'c']), 'g'), 'g');
    const inset = PADDING_PX[frame.padding!];
    expect(inset).toBe(MIND_GROUP_PADDING);
    const titleBottom = inset + labelFontPx(frame.textSize) * LABEL_LINE_HEIGHT;
    const membersTop = MIND_GROUP_PADDING + MIND_GROUP_TITLE_BAND;
    // The band is whole pixels round a 17.5 px line, so the gap is the inset to within half a pixel.
    expect(Math.abs(membersTop - titleBottom - MIND_GROUP_PADDING)).toBeLessThanOrEqual(0.5);
  });

  it('brings an older frame’s title in to the inset as it settles', () => {
    const grouped = groupMindNodes(tidy(), new Set(['b', 'c']), 'g');
    const older = grouped.map((e) => (e.id === 'g' ? { ...e, padding: 'sm' as const } : e));
    expect(PADDING_PX[get(settleMindGroups(older), 'g').padding!]).toBe(MIND_GROUP_PADDING);
  });

  it('follows its members, and goes when they all leave it or a node names a frame that is gone', () => {
    const grouped = groupMindNodes(tidy(), new Set(['b', 'c']), 'g');
    const moved = grouped.map((e) =>
      e.id === 'b' || e.id === 'c' ? { ...e, x: (e as ShapeElement).x + 50 } : e,
    );
    expect(get(settleMindGroups(moved), 'g').x).toBe(get(grouped, 'g').x + 50);
    const left = moved.map((e) => {
      if (e.type !== 'shape' || e.id === 'g') return e;
      const { mindGroup: _g, ...rest } = e;
      return rest;
    });
    expect(settleMindGroups(left).some((e) => e.id === 'g')).toBe(false);
    const orphan = settleMindGroups(grouped.filter((e) => e.id !== 'g'));
    expect(get(orphan, 'b').mindGroup).toBeUndefined();
  });

  it('ungroups from its frame, and a deleted frame frees its members and closes the room', () => {
    const grouped = groupMindNodes(tidy(), new Set(['b', 'c']), 'g');
    const out = ungroupMindNodes(grouped, new Set(['g']));
    expect(out.some((e) => e.id === 'g')).toBe(false);
    expect(get(out, 'b').mindGroup).toBeUndefined();
    const deleted = relayoutAfterRemoval(
      grouped,
      grouped.filter((e) => e.id !== 'g'),
    );
    expect(get(deleted, 'c').mindGroup).toBeUndefined();
    expect(isMindTreeTidy(deleted, 'r', 'tree')).toBe(true);
  });

  it('numbers its members when the frame is numbered', () => {
    const grouped = groupMindNodes(tidy(), new Set(['b', 'c']), 'g');
    const out = setMindNumbered(grouped, new Set(['g']), true);
    expect(get(out, 'b').mindNumbered).toBe(true);
    expect(get(out, 'g').mindNumbered).toBeUndefined();
  });

  it('moves the group as one when its frame is dragged between siblings', () => {
    const grouped = groupMindNodes(tidy(), new Set(['a', 'b']), 'g');
    const dy = get(grouped, 'd').y + 60 - get(grouped, 'a').y;
    const after = grouped.map((e) =>
      ['a', 'b', 'g'].includes(e.id) ? { ...e, y: (e as ShapeElement).y + dy } : e,
    );
    const out = planMindDrop(grouped, after, 'g', new Set(['g']));
    expect(out.kind).toBe('reordered');
    const order = ['a', 'b', 'c', 'd'].sort(
      (p, q) => get(out.elements, p).y - get(out.elements, q).y,
    );
    expect(order).toEqual(['c', 'd', 'a', 'b']);
    expect(get(out.elements, 'g').y).toBe(
      get(out.elements, 'a').y - MIND_GROUP_PADDING - MIND_GROUP_TITLE_BAND,
    );
  });
});

describe('a group frame holds its members', () => {
  it('is their container, and sits in their parent', async () => {
    const { containerContents, deriveContainers } = await import('./containment');
    const grouped = groupMindNodes(tidy(), new Set(['b', 'c']), 'g');
    const holders = deriveContainers(grouped);
    expect(holders.get('b')).toBe('g');
    expect(holders.get('g')).toBe('r');
    expect([...containerContents(grouped, new Set(['g']))].sort()).toEqual(['b', 'c', 'g']);
  });
});
