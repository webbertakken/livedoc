// A reading as an older api or an earlier export wrote it: made before candidate contexts, the structure or the
// context map, it lacks them. Read as having none (docs/specs/021-event-storming/board-reading.md "Output").

import type { StormReading } from './types';

type LaterParts = 'contexts' | 'lanes' | 'pivotal' | 'phases' | 'decisions' | 'contextMap';

export type OlderStormReading = Omit<StormReading, LaterParts> &
  Partial<Pick<StormReading, LaterParts>>;

const list = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);

export function withReadingDefaults(reading: OlderStormReading): StormReading {
  return {
    ...reading,
    contexts: list(reading.contexts),
    lanes: list(reading.lanes),
    pivotal: list(reading.pivotal),
    phases: list(reading.phases),
    decisions: list(reading.decisions),
    contextMap: list(reading.contextMap),
  };
}
