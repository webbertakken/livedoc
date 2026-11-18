// An entity's fields and the relationships between entities (docs/specs/009-elements/entity.md): the
// rules every surface shares, so the canvas, the menu, the ring, the export, the imports and the agents
// read a field the same way, and say which arrows join two entities. Pure. Writing fields, relationships and
// related entities is entity-edits.ts's, which loads with the entities family (docs/specs/016-platform/web-performance.md).

import type { ArrowheadShape } from './arrow-style';
import type { ArrowElement, Endpoint } from './arrow-types';
import type { EntityField, EntityKey } from './data-shapes';
import type { ErShape } from './er-heads';
import { ENTITY_KEY_GUTTER_PX, ENTITY_KEY_PAIR_GUTTER_PX } from './entity-geometry';
import type { ShapeElement } from './element-types';
import type { Element, ElementId } from './index';

export const isEntity = (el: Element | undefined): el is ShapeElement =>
  el?.type === 'shape' && el.shape === 'entity';

// --- Keys -------------------------------------------------------------------------------------------

// What each key reads as, wherever it is written out (the menu's key button, the text views).
export const ENTITY_KEY_LABELS: Readonly<Record<EntityKey, string>> = {
  pk: 'PK',
  fk: 'FK',
  'pk-fk': 'PK FK',
  uk: 'UK',
};

// composite key; a primary key wins over a unique one.
export function entityKeyOf(markers: Iterable<string>): EntityKey | undefined {
  const set = new Set([...markers].map((m) => m.toUpperCase()));
  if (set.has('PK')) return set.has('FK') ? 'pk-fk' : 'pk';
  if (set.has('FK')) return 'fk';
  if (set.has('UK')) return 'uk';
  return undefined;
}

const LEGACY_KEY_WORD = /\b(PK|FK|UK)\b/g;

// A field as it reads (spec "Keys"): its own key, or, on a field written before keys existed, the key
// words in its type text, with the type shown without them (`uuid FK, null` reads as FK `uuid, null`).
export function entityFieldView(field: EntityField): EntityField {
  if (field.key || !field.type) return field;
  const words = field.type.match(LEGACY_KEY_WORD);
  if (!words) return field;
  const type = field.type
    .replace(LEGACY_KEY_WORD, '')
    .replace(/\s*,\s*(,\s*)*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '');
  const key = entityKeyOf(words);
  return { name: field.name, ...(type ? { type } : {}), ...(key ? { key } : {}) };
}

// The key gutter's width for these fields (spec "How it looks"): none without a key, wider for a PK FK pair.
export function entityKeyGutterPx(fields: readonly EntityField[]): number {
  let gutter = 0;
  for (const f of fields) {
    const key = entityFieldView(f).key;
    if (key === 'pk-fk') return ENTITY_KEY_PAIR_GUTTER_PX;
    if (key) gutter = ENTITY_KEY_GUTTER_PX;
  }
  return gutter;
}

export const isForeignKey = (field: EntityField | undefined): boolean => {
  const key = field ? entityFieldView(field).key : undefined;
  return key === 'fk' || key === 'pk-fk';
};

export const isPrimaryKey = (field: EntityField | undefined): boolean => {
  const key = field ? entityFieldView(field).key : undefined;
  return key === 'pk' || key === 'pk-fk';
};

// --- Relationships ----------------------------------------------------------------------------------

// Whether an end is pinned to an entity.
export const endsOnEntity = (ep: Endpoint, byId: (id: ElementId) => Element | undefined): boolean =>
  ep.kind === 'pinned' && isEntity(byId(ep.elementId));

// An arrow whose two ends are both on entities: the one the Cardinality button offers itself on.
export function joinsEntities(arrow: ArrowElement, elements: readonly Element[]): boolean {
  const byId = (id: ElementId) => elements.find((e) => e.id === id);
  return endsOnEntity(arrow.from, byId) && endsOnEntity(arrow.to, byId);
}

// How one ER end reads in the button's short label.
const SHORT_END: Readonly<Record<ErShape, string>> = {
  one: '1',
  'zero-or-one': '0..1',
  many: 'N',
  'one-or-many': '1..N',
  'zero-or-many': '0..N',
};

const END_SHAPES = new Set<ArrowheadShape>(Object.keys(SHORT_END) as ErShape[]);

// The pair an arrow's two ends say now (`1 : N`), or null when either end is not an ER end or is not
// drawn.
export function cardinalityLabel(arrow: ArrowElement): string | null {
  if (arrow.arrowEnds !== 'both') return null;
  const end = arrow.arrowheadShape;
  const start = arrow.arrowheadStartShape ?? end;
  if (!start || !end || !END_SHAPES.has(start) || !END_SHAPES.has(end)) return null;
  const startEr = start as ErShape;
  const endEr = end as ErShape;
  // Many to many reads N : M, as people write it.
  if (startEr === 'many' && endEr === 'many') return 'N : M';
  return `${SHORT_END[startEr]} : ${SHORT_END[endEr]}`;
}
