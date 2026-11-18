// The entities family (docs/specs/016-platform/web-performance.md): a record box's face, opening a field from a
// double-click, its verbs (hooks/canvas/entity-verbs.ts), and the model parts only an entity on the board uses:
// writing its fields, its relationships and a related entity, and pointing at its rows. Loaded through the registry
// (lib/element-kinds), never imported statically; its wire, its reading and its export stay base.
export { EntityView } from '@/components/canvas/entity/EntityView';
export { openEntityFieldAt } from '@/components/canvas/entity/entity-double-click';
export { entityVerbs } from '@/hooks/canvas/entity-verbs';
export {
  buildRelatedEntity,
  cardinalityPatch,
  entityPartAt,
  nextEntityKey,
  removedFieldRemap,
  snapToEntityField,
  withEntityFields,
  withRelationshipHeads,
} from '@livedoc/document';
