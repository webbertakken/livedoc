import { vi } from 'vitest';
import type { LaneActions } from './useLaneActions';

/** The lane acts as spies, for the suites that hand a canvas its suggestion controls. */
export const laneActionSpies = (): LaneActions => ({
  applyLanePlan: vi.fn<LaneActions['applyLanePlan']>(),
  dismissLanePlan: vi.fn<LaneActions['dismissLanePlan']>(),
  arrange: vi.fn<LaneActions['arrange']>(),
  keepArranged: vi.fn<LaneActions['keepArranged']>(),
  selectNote: vi.fn<LaneActions['selectNote']>(),
});
