import { apiLoadTabRevisioned } from '@/lib/api-client';
import { loadKindFamiliesFor } from './load-for';

// A tab's read, answered once the families its elements need are in (docs/specs/016-platform/web-performance.md
// "Another tab"): every tab the editor reads after the first enters through here, so it draws with its faces.
export async function loadTabWithKindFamilies(
  ...args: Parameters<typeof apiLoadTabRevisioned>
): ReturnType<typeof apiLoadTabRevisioned> {
  const loaded = await apiLoadTabRevisioned(...args);
  if (loaded) await loadKindFamiliesFor(loaded.tab.elements, 'tab');
  return loaded;
}
