import { KIND_FAMILY_IDS } from './families';
import { loadKindFamily } from './store';

// Every family in, for a test that draws or places elements of any kind as the editor does after its idle prefetch.
export async function loadEveryKindFamily(): Promise<void> {
  await Promise.all(KIND_FAMILY_IDS.map((id) => loadKindFamily(id, 'idle')));
}
