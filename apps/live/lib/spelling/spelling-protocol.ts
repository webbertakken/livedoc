// What the page and the spelling worker say to each other (docs/specs/034-text-documents/tools.md "Spelling and
// grammar"): each request carries an id its answer repeats.
import type { SpellingLanguage } from './spelling-languages';

/** A question for the worker, before it is given its id. */
export type SpellingAsk =
  | { kind: 'check'; language: SpellingLanguage; words: readonly string[] }
  | { kind: 'suggest'; language: SpellingLanguage; word: string; most: number }
  | { kind: 'correct'; language: SpellingLanguage; word: string };

export type SpellingRequest = SpellingAsk & { id: number };

export type SpellingFailure = 'load-failed';

export type SpellingResponse =
  | { id: number; kind: 'checked'; misspelt: readonly string[] }
  | { id: number; kind: 'suggested'; suggestions: readonly string[] }
  | { id: number; kind: 'corrected'; correction: string | null }
  | { id: number; kind: 'failed'; error: SpellingFailure; detail: string };
