// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createShape, type PlanViewRef, type ShapeElement } from '@livedoc/document';
import { ITEM_TYPES, type Item, type PlanViewId } from '@livedoc/items';
import { PlanProvider, type PlanContextValue } from '../PlanContext';
import { PlanViewView } from './PlanViewView';

// docs/specs/004-interface-design/sizing.md (D239, D240): a Plan view's frame and a metric tile's name and line are
// chrome on the sizing scale; a tile's figure is drawn art and the view's drawing is content.
const ID = 'chart-1';
let n = 0;
const person = (i: number) => ({ id: `p${i}`, name: `Person ${i}`, color: '#2563eb' });
const card = (fields: Item['fields']): Item => {
  n += 1;
  return {
    id: `i${n}`,
    type: 'task',
    key: n,
    rank: `r${n}`,
    fields,
    rev: 1,
    createdBy: person(0),
    updatedBy: person(0),
    createdAt: 0,
    updatedAt: 0,
  };
};

function planWith(over: Partial<PlanContextValue> = {}, items: Item[] = []): PlanContextValue {
  return {
    items: new Map(items.map((i) => [i.id, i])),
    types: ITEM_TYPES,
    status: 'ready',
    planInput: true,
    canEdit: true,
    openItem: vi.fn(),
    updateView: vi.fn(),
    statusNames: new Map([['todo', 'To do']]),
    statusPhases: new Map([['todo', 'todo']]),
    ...over,
  } as unknown as PlanContextValue;
}

function draw(
  view: PlanViewId,
  plan: PlanContextValue,
  settings: Omit<PlanViewRef, 'view'> = {},
  size: { width?: number; height?: number } = {},
) {
  const el = {
    ...createShape('plan-view', 0, 0),
    ...size,
    id: ID,
    planView: { view, ...settings },
  } as ShapeElement;
  return render(
    <PlanProvider value={plan}>
      <PlanViewView element={el} />
    </PlanProvider>,
  );
}

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

describe('a Plan view on the sizing scale', () => {
  it('titles its frame at 16 px in regular weight', () => {
    draw('workload', planWith({}, [card({ title: 'a', status: 'todo' })]));
    expect(screen.getByText('Cards by Assignee').className).toContain('text-panel-title');
  });

  it('reads a metric tile’s name and line on the scale, its figure the dashboard’s', () => {
    const { container } = draw(
      'metric:count',
      planWith({}, [card({ title: 'a', status: 'todo' })]),
      {},
      { width: 360, height: 260 },
    );
    expect(container.querySelector('.dashboard-figure')).not.toBeNull();
    expect(container.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('reads a small metric widget’s name at 12 px as written', () => {
    const { container } = draw('metric:count', planWith(), {}, { width: 200, height: 60 });
    expect(container.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });
});
