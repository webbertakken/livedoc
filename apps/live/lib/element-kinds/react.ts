import {
  createElement,
  useEffect,
  useSyncExternalStore,
  type ComponentType,
  type FunctionComponent,
} from 'react';
import type { Element } from '@livedoc/document';
import type { KindFamilyId, KindFamilyModule } from './families';
import { kindFamilyOf } from './kind-family-of';
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
  const family = kindFamilyOf(element);
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
