// An arrow a drag has joined to two entities, with no head of its own, becomes a relationship as it is released
// (docs/specs/009-elements/entity.md "Cardinality ends"). Folded into the arrow drag's result. The relationship's code
// is the entities family's: a board where it is not in draws no entity to join.
import type { Element } from '@livedoc/document';
import { isKindFamilyLoaded, requireKindFamily } from '@/lib/element-kinds/store';

export function relationshipOnRelease(arrowId: string): (elements: Element[]) => Element[] {
  return (elements) =>
    isKindFamilyLoaded('entities')
      ? requireKindFamily('entities').withRelationshipHeads(elements, arrowId)
      : elements;
}
