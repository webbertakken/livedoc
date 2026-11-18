// The Behaviour elements' setters on the editor (docs/specs/009-elements/portal-element.md,
// docs/specs/012-collaboration/session-button.md, docs/specs/009-elements/reveal-zone.md,
// docs/specs/012-collaboration/picker.md). Their code is the session controls family's (portal-setters.ts), reached
// through the registry when the element's menu acts: the menu opens on a drawn element, so once the family is in.
import { requireKindFamily } from '@/lib/element-kinds/store';
import type { PortalSetterDeps, PortalSetters } from './portal-setters';

export function usePortalSetters(deps: PortalSetterDeps): PortalSetters {
  const setters = () => requireKindFamily('session-controls').portalSetters(deps);
  return {
    setPortalTargetSelected: (...args) => setters().setPortalTargetSelected(...args),
    setPortalNameSelected: (...args) => setters().setPortalNameSelected(...args),
    createLinkedPortal: (...args) => setters().createLinkedPortal(...args),
    setSessionConfigSelected: (...args) => setters().setSessionConfigSelected(...args),
    setRevealedSelected: (...args) => setters().setRevealedSelected(...args),
    setPickerSourceSelected: (...args) => setters().setPickerSourceSelected(...args),
    setPickerOptionsSelected: (...args) => setters().setPickerOptionsSelected(...args),
    setReactionSelected: (...args) => setters().setReactionSelected(...args),
  };
}
