import { vi } from 'vitest';
import type { AskActions } from './useAskActions';
import type { LaneActions } from './useLaneActions';

/** The ask acts as spies. */
export const askActionSpies = (): AskActions => ({
  openAsk: vi.fn<AskActions['openAsk']>(),
  copyPrompt: vi.fn<AskActions['copyPrompt']>(async () => true),
  ask: vi.fn<AskActions['ask']>(async () => {}),
  cancelAsk: vi.fn<AskActions['cancelAsk']>(),
  saveAbout: vi.fn<AskActions['saveAbout']>(),
  forgetDeclined: vi.fn<AskActions['forgetDeclined']>(),
  foldBoard: vi.fn<AskActions['foldBoard']>(),
});

/** The acts on a whole board (its lanes, its asks) as spies, for the suites that hand a canvas its suggestion
 *  controls. */
export const laneActionSpies = (): LaneActions & AskActions => ({
  applyLanePlan: vi.fn<LaneActions['applyLanePlan']>(),
  dismissLanePlan: vi.fn<LaneActions['dismissLanePlan']>(),
  arrange: vi.fn<LaneActions['arrange']>(),
  keepArranged: vi.fn<LaneActions['keepArranged']>(),
  selectNote: vi.fn<LaneActions['selectNote']>(),
  ...askActionSpies(),
});
