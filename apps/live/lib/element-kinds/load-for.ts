import { debugLog } from '@/lib/debug-log';
import { kindFamiliesOfTab } from './kind-family-of';
import { loadKindFamily, type LoadReason } from './store';

// Loads every family a tab needs (its elements', and its articles'), in parallel (docs/specs/016-platform/web-performance.md
// "At the open"). Settles once each is in or has failed, never rejects: the gate waits for settled, not for success,
// so a family that cannot load leaves its elements undrawn rather than the board unopened.
export async function loadKindFamiliesFor(
  tab: { elements?: unknown; articles?: unknown; kind?: unknown; layers?: unknown },
  reason: LoadReason,
): Promise<void> {
  const families = kindFamiliesOfTab(tab);
  if (families.length === 0) return;
  const startedAt = performance.now();
  await Promise.all(families.map((id) => loadKindFamily(id, reason)));
  debugLog(
    `[element-kinds] gate families=${families.join(',')} ms=${Math.round(performance.now() - startedAt)}`,
  );
}
