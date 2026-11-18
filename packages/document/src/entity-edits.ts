// Writing an entity's fields, its relationships and a related entity (docs/specs/009-elements/entity.md): the rules
// the canvas, the menu, the ring and the agents write by, so a field is written and two entities joined the same
// way everywhere. Pure. Reading a field is entity-fields.ts's; this loads with the entities family
// (docs/specs/016-platform/web-performance.md).

import type { ArrowElement, Endpoint } from './arrow-types';
import {
  ENTITY_KEYS,
  ENTITY_MAX_FIELDS,
  ENTITY_MAX_TEXT,
  type EntityField,
  type EntityKey,
} from './data-shapes';
import type { ErShape } from './er-heads';
import {
  endsOnEntity,
  entityFieldView,
  isEntity,
  isForeignKey,
  isPrimaryKey,
} from './entity-fields';
import { entityHeight } from './entity-geometry';
import type { ShapeElement } from './element-types';
import type { Element, ElementId } from './index';

// The order the key button cycles in: none, then each key (spec "Editing on the canvas").
export function nextEntityKey(key: EntityKey | undefined): EntityKey | undefined {
  if (key === undefined) return ENTITY_KEYS[0];
  const i = ENTITY_KEYS.indexOf(key);
  return i === ENTITY_KEYS.length - 1 ? undefined : ENTITY_KEYS[i + 1];
}

// The key the marker words of a Mermaid attribute or a legacy type name: PK and FK together are the
// --- Writing fields ---------------------------------------------------------------------------------

// The fields as stored: at most 40, each name and type at most 80 characters, a
// blank type and no key stored as absent, so a row round-trips identically however it was emptied.
export function cleanEntityFields(fields: readonly EntityField[]): EntityField[] {
  return fields.slice(0, ENTITY_MAX_FIELDS).map((f) => {
    const type = f.type?.trim().slice(0, ENTITY_MAX_TEXT);
    const key = f.key && (ENTITY_KEYS as readonly string[]).includes(f.key) ? f.key : undefined;
    return {
      name: f.name.slice(0, ENTITY_MAX_TEXT),
      ...(type ? { type } : {}),
      ...(key ? { key } : {}),
    };
  });
}

// The height an entity with `count` fields is drawn at when the editor fits it: every row, and one empty
// row's room when it has none, so the "No fields yet" line is not clipped.
export const fittedEntityHeight = (count: number, el: Pick<ShapeElement, 'textSize'>): number =>
  entityHeight(Math.max(1, count), el.textSize);

// Where each old field went: its new index, or null when it was removed.
export type FieldRemap = (index: number) => number | null;

// The remap for removing field `removed`: it lets go, and the fields after it move up one.
export const removedFieldRemap =
  (removed: number): FieldRemap =>
  (i) =>
    i === removed ? null : i > removed ? i - 1 : i;

// The remap for inserting a field at `at`: the fields from there move down one.
export const insertedFieldRemap =
  (at: number): FieldRemap =>
  (i) =>
    i >= at ? i + 1 : i;

function remapEnd(ep: Endpoint, entityId: ElementId, remap: FieldRemap): Endpoint {
  if (ep.kind !== 'pinned' || ep.elementId !== entityId || ep.field === undefined) return ep;
  const next = remap(ep.field);
  if (next === ep.field) return ep;
  if (next === null) {
    const { field: _dropped, ...rest } = ep;
    return rest;
  }
  return { ...ep, field: next };
}

/**
 * New fields on one entity, applied to the element list (spec "The box follows its fields"): the
 * fields cleaned, the box refitted to them keeping any extra height it had, and every relationship end
 * pinned to a moved or removed field following it (spec "Field to field").
 */
export function withEntityFields(
  elements: Element[],
  entityId: ElementId,
  fields: readonly EntityField[],
  remap?: FieldRemap,
): Element[] {
  const cleaned = cleanEntityFields(fields);
  return elements.map((el) => {
    if (el.id === entityId && isEntity(el)) {
      const before = el.entityFields?.length ?? 0;
      const slack = Math.max(0, el.height - fittedEntityHeight(before, el));
      return {
        ...el,
        entityFields: cleaned,
        height: fittedEntityHeight(cleaned.length, el) + slack,
      };
    }
    if (remap && el.type === 'arrow') {
      const from = remapEnd(el.from, entityId, remap);
      const to = remapEnd(el.to, entityId, remap);
      return from === el.from && to === el.to ? el : { ...el, from, to };
    }
    return el;
  });
}

// --- Relationships ----------------------------------------------------------------------------------

// The field an end lands on, when it is pinned to one of an entity's fields.
function fieldAt(ep: Endpoint, byId: (id: ElementId) => Element | undefined): EntityField | null {
  if (ep.kind !== 'pinned' || ep.field === undefined) return null;
  const el = byId(ep.elementId);
  return isEntity(el) ? (el.entityFields?.[ep.field] ?? null) : null;
}

// An arrow between two entities, drawn in one drag with no head choice of its own, becomes a relationship
// as it is released (spec "Cardinality ends"): the end on a foreign key field is many, the other one; with
// no foreign key on either end, from one to many. Null when it does not apply.
export function relationshipHeads(
  arrow: ArrowElement,
  elements: readonly Element[],
): Pick<ArrowElement, 'arrowEnds' | 'arrowheadShape' | 'arrowheadStartShape'> | null {
  if (arrow.arrowEnds || arrow.arrowheadShape || arrow.arrowheadStartShape) return null;
  const byId = (id: ElementId) => elements.find((e) => e.id === id);
  if (!endsOnEntity(arrow.from, byId) || !endsOnEntity(arrow.to, byId)) return null;
  const fromMany = isForeignKey(fieldAt(arrow.from, byId) ?? undefined);
  const toMany = isForeignKey(fieldAt(arrow.to, byId) ?? undefined);
  const [start, end]: [ErShape, ErShape] = fromMany && !toMany ? ['many', 'one'] : ['one', 'many'];
  return { arrowEnds: 'both', arrowheadStartShape: start, arrowheadShape: end };
}

// The Cardinality presets (spec "Cardinality ends"), each the start's end and the end's end.
export type CardinalityPreset = {
  id: string;
  label: string;
  short: string;
  start: ErShape;
  end: ErShape;
};

export const CARDINALITY_PRESETS: readonly CardinalityPreset[] = [
  { id: 'one-to-one', label: 'One to One', short: '1 : 1', start: 'one', end: 'one' },
  { id: 'one-to-many', label: 'One to Many', short: '1 : N', start: 'one', end: 'many' },
  { id: 'many-to-one', label: 'Many to One', short: 'N : 1', start: 'many', end: 'one' },
  { id: 'many-to-many', label: 'Many to Many', short: 'N : M', start: 'many', end: 'many' },
  {
    id: 'zero-or-one-to-many',
    label: 'Zero or One to Many',
    short: '0..1 : N',
    start: 'zero-or-one',
    end: 'many',
  },
  {
    id: 'one-to-zero-or-many',
    label: 'One to Zero or Many',
    short: '1 : 0..N',
    start: 'one',
    end: 'zero-or-many',
  },
];

export const cardinalityPatch = (
  preset: CardinalityPreset,
): Pick<ArrowElement, 'arrowEnds' | 'arrowheadShape' | 'arrowheadStartShape'> => ({
  arrowEnds: 'both',
  arrowheadStartShape: preset.start,
  arrowheadShape: preset.end,
});

// --- Add Related Entity -----------------------------------------------------------------------------

// `Order line` -> `order_line_id`: the foreign key a related entity names after its source (spec "Growing a
// model"). A title with nothing usable in it gives `parent_id`.
export function foreignKeyName(title: string): string {
  const snake = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${singularOf(snake) || 'parent'}_id`.slice(0, ENTITY_MAX_TEXT);
}

// A plural table name (`customers`, `categories`, `boxes`) keys as its singular, as a schema writes it.
// A word that only ends in s (`status`, `address`, `analysis`) is already singular and stays as it is.
function singularOf(snake: string): string {
  if (snake.length <= 3) return snake;
  if (/[^aeiou]ies$/.test(snake)) return `${snake.slice(0, -3)}y`;
  if (/(?:ss|sh|ch|x|z)es$/.test(snake)) return snake.slice(0, -2);
  if (/(?:ss|us|is)$/.test(snake)) return snake;
  return /s$/.test(snake) ? snake.slice(0, -1) : snake;
}

// The source's primary key field: the first field that is a primary key, by its own key or its type text.
export function primaryKeyIndex(fields: readonly EntityField[]): number {
  return fields.findIndex((f) => isPrimaryKey(f));
}

// The fields a related entity starts with: its own `id` primary key and a foreign key named after the
// source, both typed like the source's primary key (or `uuid` without one).
export function relatedEntityFields(source: ShapeElement): EntityField[] {
  const fields = source.entityFields ?? [];
  const pk = fields[primaryKeyIndex(fields)];
  const type = (pk ? entityFieldView(pk).type : undefined) ?? 'uuid';
  return [
    { name: 'id', type, key: 'pk' },
    { name: foreignKeyName(source.label ?? ''), type, key: 'fk' },
  ];
}

// `relationshipHeads` applied to one arrow in the element list; the list itself when it does not apply.
export function withRelationshipHeads(elements: Element[], arrowId: ElementId): Element[] {
  const arrow = elements.find((e): e is ArrowElement => e.id === arrowId && e.type === 'arrow');
  const heads = arrow ? relationshipHeads(arrow, elements) : null;
  if (!heads) return elements;
  return elements.map((el) => (el === arrow ? { ...arrow, ...heads } : el));
}
