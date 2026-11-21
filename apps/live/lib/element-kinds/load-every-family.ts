// Every family in, for a test that draws or places elements of any kind as the editor does after its idle prefetch.
// Test-only. Each family module is imported here statically, so a test file pays their transform at collection and
// the loads in its hook find them ready (docs/specs/003-system-architecture/testing.md "A test never pays a cold
// module load"): loaded lazily, the fourteen took over the hook's ten seconds on a busy machine.
import './families/avatar-mode';
import './families/charts';
import './families/collab-panels';
import './families/concepts';
import './families/embeds';
import './families/entities';
import './families/event-storming';
import './families/mind-maps';
import './families/office-seating';
import './families/pages-articles';
import './families/session-controls';
import './families/sketches';
import './families/web-components';
import './families/wireframes';
import { KIND_FAMILY_IDS } from './families';
import { loadKindFamily } from './store';

export async function loadEveryKindFamily(): Promise<void> {
  await Promise.all(KIND_FAMILY_IDS.map((id) => loadKindFamily(id, 'idle')));
}
