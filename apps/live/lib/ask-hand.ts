import { STORM_ASK_HANDS, type StormAskHand } from '@livedoc/storm-reading';
import { readLocalStorageSafe, writeLocalStorageSafe } from './local-storage-safe';

// The hand last used for an ask, remembered on this device (docs/specs/021-event-storming/asks.md "The three
// hands"): the CLI the first time.

export const ES_ASK_HAND_KEY = 'livedoc:v2:es-ask-hand';

export function readAskHand(): StormAskHand {
  const saved = readLocalStorageSafe(ES_ASK_HAND_KEY);
  return STORM_ASK_HANDS.find((hand) => hand === saved) ?? 'cli';
}

export function writeAskHand(hand: StormAskHand): void {
  writeLocalStorageSafe(ES_ASK_HAND_KEY, hand);
}
