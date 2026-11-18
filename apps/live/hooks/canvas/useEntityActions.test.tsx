// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CARDINALITY_PRESETS,
  createShape,
  entityRowTop,
  type ArrowElement,
  type Element,
  type ShapeElement,
  type Tab,
} from '@livedoc/document';
import { getEntityFieldEdit, setEntityFieldEdit } from '@/lib/entity-field-edit';
import { loadEveryKindFamily } from '@/lib/element-kinds/load-every-family';
import { KindFamilyNotLoaded, resetKindFamiliesForTests } from '@/lib/element-kinds/store';
import { useEntityActions } from './useEntityActions';
import { resolveArrowEndpointDrag } from './arrow-endpoint-resolve';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

// docs/specs/009-elements/entity.md: the editor's entity verbs, each one commit. Their code is the entities
// family's (docs/specs/016-platform/web-performance.md), in as after the board's idle prefetch.
beforeEach(loadEveryKindFamily);
afterEach(() => resetKindFamiliesForTests());

const source: ShapeElement = {
  ...createShape('entity', 0, 0),
  id: 'src',
  label: 'Customer',
};
const arrow: ArrowElement = {
  id: 'a',
  type: 'arrow',
  from: { kind: 'pinned', elementId: 'src', anchor: 'e' },
  to: { kind: 'free', x: 900, y: 0 },
};

function setup(elements: Element[], selectedId: string | null, editsBlocked = false) {
  let doc = elements;
  const commit = vi.fn((map: (els: Element[]) => Element[]) => {
    doc = map(doc);
  });
  const deps = {
    activeTab: { id: 't', elements } as unknown as Tab,
    readSelection: () => ({ selectedId, multiSelectedIds: new Set<string>() }) as never,
    commit,
    styleNewElement: <T extends Element>(el: T) => ({ ...el, arrowheadShape: 'diamond' }) as T,
    setSelectedId: vi.fn(),
    setEditingId: vi.fn(),
    beginAnchorDrag: vi.fn(),
    editsBlocked,
  };
  const { result } = renderHook(() => useEntityActions(deps));
  return { result: result.current, deps, commit, doc: () => doc };
}

describe('useEntityActions', () => {
  it('adds a related entity and its relationship in one commit, keeping the ER ends', () => {
    const { result, deps, commit, doc } = setup([source], 'src');
    result.addRelatedSelected('right');
    expect(commit).toHaveBeenCalledTimes(1);
    const [, entity, rel] = doc() as [ShapeElement, ShapeElement, ArrowElement];
    expect(entity.entityFields![1]!.name).toBe('customer_id');
    expect(rel).toMatchObject({ arrowheadStartShape: 'one', arrowheadShape: 'many' });
    expect(deps.setSelectedId).toHaveBeenCalledWith(entity.id);
    expect(deps.setEditingId).toHaveBeenCalledWith(entity.id);
  });

  it('opens a new field without writing one', () => {
    const { result, commit } = setup([source], 'src');
    result.addFieldSelected();
    expect(commit).not.toHaveBeenCalled();
    expect(getEntityFieldEdit()).toEqual({ entityId: 'src', index: 2 });
    setEntityFieldEdit(null);
  });

  it('saves fields through the fit, and starts a field relationship', () => {
    const { result, deps, doc } = setup([source], 'src');
    result.setFields('src', [{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
    expect((doc()[0] as ShapeElement).entityFields).toHaveLength(3);
    expect((doc()[0] as ShapeElement).height).toBeGreaterThan(source.height);
    const e = {} as never;
    result.startFieldArrow('src', 'w', 1, e);
    expect(deps.beginAnchorDrag).toHaveBeenCalledWith('src', 'w', e, { field: 1 });
  });

  it('sets a cardinality preset on the selected arrow', () => {
    const { result, doc } = setup([source, arrow], 'a');
    result.setCardinalitySelected(CARDINALITY_PRESETS.find((p) => p.id === 'many-to-many')!);
    expect(doc()[1]).toMatchObject({
      arrowEnds: 'both',
      arrowheadStartShape: 'many',
      arrowheadShape: 'many',
    });
  });

  it('writes nothing when edits are blocked or nothing fits', () => {
    const blocked = setup([source, arrow], 'src', true);
    blocked.result.addRelatedSelected('left');
    blocked.result.setFields('src', []);
    blocked.result.startFieldArrow('src', 'e', 0, {} as never);
    blocked.result.setCardinalitySelected(CARDINALITY_PRESETS[0]!);
    expect(blocked.commit).not.toHaveBeenCalled();
    expect(blocked.deps.beginAnchorDrag).not.toHaveBeenCalled();
    const locked = setup([{ ...source, locked: true }], 'src');
    locked.result.addRelatedSelected('left');
    locked.result.addFieldSelected();
    expect(locked.commit).not.toHaveBeenCalled();
    expect(getEntityFieldEdit()).toBeNull();
  });
});

describe('an arrow end dragged over an entity', () => {
  const target: ShapeElement = { ...source, id: 'tgt', x: 600, y: 0 };
  const args = {
    cursor: { x: 650, y: entityRowTop(target, 1) + 4 },
    elements: [source, target, arrow],
    arrowId: 'a',
    end: 'to' as const,
    guidesOn: true,
  };

  it('pins to the field under the cursor, unless Cmd / Ctrl frees it', () => {
    const pinned = resolveArrowEndpointDrag({ ...args, noSnap: false });
    expect(pinned.endpoint).toEqual({ kind: 'pinned', elementId: 'tgt', anchor: 'w', field: 1 });
    expect(pinned.snapTargets).toEqual([{ x: 600, y: expect.any(Number), active: true }]);
    expect(resolveArrowEndpointDrag({ ...args, noSnap: true }).endpoint.kind).toBe('free');
  });

  it('pins to the entity itself while the family is not in', () => {
    resetKindFamiliesForTests();
    const pinned = resolveArrowEndpointDrag({ ...args, noSnap: false });
    expect(pinned.endpoint).toMatchObject({ kind: 'pinned', elementId: 'tgt' });
    expect(pinned.endpoint).not.toHaveProperty('field');
  });
});

describe('before the entities family is in', () => {
  it('names the family at the press', () => {
    resetKindFamiliesForTests();
    const { result } = setup([source], 'src');
    expect(() => result.addRelatedSelected('right')).toThrow(KindFamilyNotLoaded);
  });
});
