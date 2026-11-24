import { useEffect, useSyncExternalStore } from 'react';

import type { CodeLanguage } from '@livedoc/document';
import type { CodeToken, codeTokenRanges, TokenLanguage } from './code-tokens';
import { createListeners } from '@/lib/listeners';

// Async loader for the code tokenizer (docs/specs/009-elements/code-block.md), on the icon-registry
// pattern: one memoized dynamic import, a useSyncExternalStore pair, and a
// synchronous lookup that returns undefined pre-load so CodeBlockView
// degrades to plain monospace text (never blanks) until the chunk lands.

type Tokenizer = (code: string, language: CodeLanguage) => CodeToken[][];

let tokenizer: Tokenizer | null = null;
let ranges: typeof codeTokenRanges | null = null;
let loadPromise: Promise<void> | null = null;
const listeners = createListeners();

/** Loads the tokenizer once (a failed load is tried again on the next call); resolves when it is there or failed. */
export function loadCodeTokenizer(): Promise<void> {
  if (tokenizer) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = import('./code-tokens')
    .then((m) => {
      tokenizer = m.tokenizeCode;
      ranges = m.codeTokenRanges;
      listeners.notify();
    })
    .catch((err) => {
      // Failed chunk fetch: log, clear the memo so the next consumer mount
      // retries, keep rendering plain text meanwhile.
      console.error('code tokenizer failed to load', err);
      loadPromise = null;
    });
  return loadPromise;
}

const isLoaded = () => tokenizer !== null;

// Tokenize synchronously if the chunk has landed; undefined otherwise.
export function tokenizeLoaded(code: string, language: CodeLanguage): CodeToken[][] | undefined {
  return tokenizer ? tokenizer(code, language) : undefined;
}

/** Where the tokens other than plain text lie in `code`, if the tokenizer has loaded; undefined otherwise. */
export function codeRangesLoaded(
  code: string,
  language: TokenLanguage,
): ReturnType<typeof codeTokenRanges> | undefined {
  return ranges ? ranges(code, language) : undefined;
}

// Kick the load on mount + re-render once when it lands.
export function useCodeTokenizer(): boolean {
  useEffect(() => {
    void loadCodeTokenizer();
  }, []);
  return useSyncExternalStore(listeners.subscribe, isLoaded, () => false);
}
