import {
  createElement,
  useEffect,
  useSyncExternalStore,
  type ComponentType,
  type FunctionComponent,
} from 'react';
import type { Element, Finish } from '@livedoc/document';
import type { KindFamilyId, KindFamilyModule } from './families';
import { finishFamilyOf, kindFamilyOf } from './kind-family-of';
import {
  failedKindFamilies,
  isKindFamilyLoaded,
  loadKindFamily,
  requireKindFamily,
  subscribeKindFamilies,
} from './store';

const subscribeNothing = () => () => {};
const always = () => true;

// Whether an element can draw (docs/specs/016-platform/web-performance.md "Once the board has settled"): a
// base element always, a family's once the family is in. One that arrives before its family (a peer's, a paste)
// asks for it and draws when it lands; only those subscribe, so a base element costs nothing.
export function useKindFamilyReady(element: Element): boolean {
  return useFamilyReady(kindFamilyOf(element));
}

// Whether something drawn in this finish can draw: in a hand-drawn finish, once the sketches family is in. A finish a
// peer switched the board to before its family landed asks for it, and the board draws when it does.
export function useFinishFamilyReady(finish: Finish): boolean {
  return useFamilyReady(finishFamilyOf(finish));
}

function useFamilyReady(family: KindFamilyId | null): boolean {
  const ready = useSyncExternalStore(
    family ? subscribeKindFamilies : subscribeNothing,
    family ? () => isKindFamilyLoaded(family) : always,
    family ? () => isKindFamilyLoaded(family) : always,
  );
  useEffect(() => {
    if (family && !ready) void loadKindFamily(family, 'element');
  }, [family, ready]);
  return ready;
}

// Whether a family is in, for editor behaviours that run only once it is (an article's writing, say); asks for
// nothing, since the board's own elements already did, and re-renders when it lands.
export function useKindFamilyLoaded(family: KindFamilyId): boolean {
  return useSyncExternalStore(
    subscribeKindFamilies,
    () => isKindFamilyLoaded(family),
    () => isKindFamilyLoaded(family),
  );
}

const noFailures: readonly KindFamilyId[] = [];

export function useFailedKindFamilies(): readonly KindFamilyId[] {
  return useSyncExternalStore(subscribeKindFamilies, failedKindFamilies, () => noFailures);
}

// A face of a family, as a component that reads the family synchronously when it draws. Drawn only behind
// useKindFamilyReady, so the family is in; drawn anywhere else, it throws KindFamilyNotLoaded.
export function familyFace<F extends KindFamilyId, K extends keyof KindFamilyModule<F>>(
  family: F,
  name: K,
): KindFamilyModule<F>[K] {
  const Face: FunctionComponent<object> = (props) =>
    createElement(requireKindFamily(family)[name] as ComponentType<object>, props);
  Face.displayName = String(name);
  return Face as KindFamilyModule<F>[K];
}
