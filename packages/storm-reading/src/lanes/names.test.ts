// docs/specs/021-event-storming/lane-plans.md "The plan" (the lane names a plan rewrites) and board-structure.md
// "Lane names".
import { layoutGraph, type Element, type Tab } from '@livedoc/document';
import { describe, expect, it } from 'vitest';
import { readBoard } from '../reading';
import { board, laneText } from '../testing';
import { kitchen, xs } from './kitchen.fixture';
import { withLaneNames } from './names';

const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};
const texts = (elements: Element[]) =>
  elements.filter((el) => el.type === 'text').map((el) => [el.id, el.label, el.y + el.height / 2]);

describe('the lane names a plan writes', () => {
  it('rewrites the names the board has, top to bottom, and removes those left over', () => {
    const tab = board(
      ...kitchen().elements,
      laneText('n-people', 0, -16, 'People'),
      laneText('n-asks', 1, -16, 'Asks'),
      laneText('n-rules', 3, -16, 'Rules'),
    );
    const next = withLaneNames(tab, tab.elements, ['Orders', 'Kitchen'], 0, ids());
    expect(texts(next)).toEqual([
      ['n-people', 'Orders', 100],
      ['n-asks', 'Kitchen', 340],
    ]);
  });

  it('writes a name for a lane that has none: muted, right aligned, a gutter clear of the wall', () => {
    const tab = board(...kitchen().elements, laneText('n-people', 0, -16, 'People'));
    const next = withLaneNames(tab, tab.elements, ['Orders', 'Kitchen'], 1, ids());
    expect(texts(next)).toEqual([
      ['n-people', 'Orders', 340],
      ['new-1', 'Kitchen', 580],
    ]);
    expect(next.at(-1)).toMatchObject({
      x: -196,
      width: 180,
      textAlignX: 'right',
      textColor: '#64748b',
    });
  });

  it('writes a new name on the notes’ layer', () => {
    const tab = board({
      id: 'a',
      kind: 'domain-event',
      col: 0,
      extra: { layerId: 'layer:es:board' },
    });
    const next = withLaneNames(tab, tab.elements, ['Orders'], 0, ids());
    expect(next.at(-1)).toMatchObject({ label: 'Orders', layerId: 'layer:es:board' });
  });

  it('drops the formatting of a name it rewrites: it described the old words', () => {
    const rich = { ...laneText('n', 0, -16, 'People'), richText: [{ text: 'People', bold: true }] };
    const tab = board(...kitchen().elements, rich);
    const next = withLaneNames(tab, tab.elements, ['Orders'], 0, ids());
    expect(next.find((el) => el.id === 'n')).not.toHaveProperty('richText');
  });

  it('stands a new name clear of where the wall starts once the notes are placed', () => {
    const tab = board({ id: 'a', kind: 'domain-event', col: 0 });
    const placed = tab.elements.map((el) => ({ ...el, x: 500 }));
    const next = withLaneNames(tab, placed, ['Orders'], 0, ids());
    expect(xs(next).at(-1)).toBe(500 - 16 - 180);
  });

  it('writes nothing on a board with no workshop note', () => {
    const tab = board();
    expect(withLaneNames(tab, tab.elements, ['Orders'], 0, ids())).toEqual([]);
  });
});

describe('the storm graph’s labels (mcp-server.md §4.7)', () => {
  const graph: Tab = {
    id: 'tab-1',
    name: 'Board',
    kind: 'event-storming',
    elements: layoutGraph({
      style: 'storm',
      nodes: [
        { id: 'cook', label: 'Cook', esKind: 'actor' },
        { id: 'take', label: 'Take Order', esKind: 'command' },
        { id: 'taken', label: 'Order Taken', esKind: 'domain-event' },
      ],
      edges: [
        { from: 'cook', to: 'take' },
        { from: 'take', to: 'taken' },
      ],
    }),
  };

  it('read as lane names', () => {
    expect(readBoard(graph).lanes.map((lane) => lane.name)).toEqual([
      'Actors',
      'Commands',
      'Domain events',
    ]);
  });

  it('are rewritten by a plan, each label kept as the element it was', () => {
    const next = withLaneNames(graph, graph.elements, ['Orders', 'Kitchen'], 0, ids());
    expect(texts(next).slice(0, 2)).toEqual([
      ['lane-label-actor', 'Orders', 100],
      ['lane-label-command', 'Kitchen', 340],
    ]);
    expect(next.some((el) => el.id === 'lane-label-domain-event')).toBe(false);
  });
});
