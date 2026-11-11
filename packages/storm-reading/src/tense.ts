// The English tense heuristic behind two notation gaps (docs/specs/021-event-storming/board-reading.md "Gaps").

import { PAST_TENSE_IRREGULARS } from './constants';

const wordsIn = (text: string) => text.toLowerCase().match(/[a-z']+/g) ?? [];

export function readsAsPastTense(word: string): boolean {
  return (word.length > 3 && word.endsWith('ed')) || PAST_TENSE_IRREGULARS.has(word);
}

// An event's last word, a command's first word.
export const lastWord = (text: string): string => wordsIn(text).at(-1) ?? '';
export const firstWord = (text: string): string => wordsIn(text)[0] ?? '';
