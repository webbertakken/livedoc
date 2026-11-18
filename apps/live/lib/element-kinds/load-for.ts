import type { Element } from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';
import { kindFamiliesOf } from './kind-family-of';
import { loadKindFamily, type LoadReason } from './store';

// Loads every family a set of elements needs, in parallel (docs/specs/016-platform/blueprints/element-kinds-on-demand.md
// "Transitions"). Settles once each is in or has failed, never rejects: the gate waits for settled, not for success,
// so a family that cannot load leaves its elements undrawn rather than the board unopened.
export async function loadKindFamiliesFor(
  elements: readonly Element[],
  reason: LoadReason,
): Promise<void> {
  const families = kindFamiliesOf(elements);
  if (families.length === 0) return;
  const startedAt = performance.now();
  await Promise.all(families.map((id) => loadKindFamily(id, reason)));
  debugLog(
    `[element-kinds] gate families=${families.join(',')} ms=${Math.round(performance.now() - startedAt)}`,
  );
}
