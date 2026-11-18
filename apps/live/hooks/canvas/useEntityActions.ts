// The entity's verbs on the editor (docs/specs/009-elements/entity.md): saving fields from the canvas, drawing a
// relationship from a field, the ring's Add Field and Add Related Entity, and the Cardinality presets. Their code is
// the entities family's (entity-verbs.ts), reached through the registry at the press: a press needs an entity on the
// board, drawn once the family is in.
import { requireKindFamily } from '@/lib/element-kinds/store';
import type { EntityActions, EntityDeps } from './entity-verbs';

export type { EntityActions } from './entity-verbs';

export function useEntityActions(deps: EntityDeps): EntityActions {
  const verbs = () => requireKindFamily('entities').entityVerbs(deps);
  return {
    setFields: (...args) => verbs().setFields(...args),
    startFieldArrow: (...args) => verbs().startFieldArrow(...args),
    addFieldSelected: (...args) => verbs().addFieldSelected(...args),
    addRelatedSelected: (...args) => verbs().addRelatedSelected(...args),
    setCardinalitySelected: (...args) => verbs().setCardinalitySelected(...args),
  };
}
