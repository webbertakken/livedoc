// The spelling worker (docs/specs/034-text-documents/tools.md "Spelling and grammar"): every dictionary is fetched,
// built and read here, never on the page's thread.
import { createSpellingCore } from './spelling-core';
import { SPELLING_DICTIONARY_FILES } from './spelling-dictionaries';
import type { SpellingLanguage } from './spelling-languages';
import type { SpellingRequest, SpellingResponse } from './spelling-protocol';

const scope = self as unknown as {
  postMessage: (message: SpellingResponse) => void;
  addEventListener: (type: 'message', fn: (e: MessageEvent<SpellingRequest>) => void) => void;
};

const bytesOf = async (url: URL): Promise<Uint8Array> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url.pathname} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

const core = createSpellingCore(async (language: SpellingLanguage) => {
  const files = SPELLING_DICTIONARY_FILES[language];
  const [aff, dic] = await Promise.all([bytesOf(files.aff), bytesOf(files.dic)]);
  return { aff, dic };
});

scope.addEventListener('message', ({ data }) => {
  const answer =
    data.kind === 'check'
      ? core
          .check(data.language, data.words)
          .then((misspelt): SpellingResponse => ({ id: data.id, kind: 'checked', misspelt }))
      : core.suggest(data.language, data.word, data.most).then((suggestions): SpellingResponse => ({
          id: data.id,
          kind: 'suggested',
          suggestions,
        }));
  void answer
    .catch((err: unknown): SpellingResponse => ({
      id: data.id,
      kind: 'failed',
      error: 'load-failed',
      detail: `${data.language}: ${String(err)}`,
    }))
    .then((response) => scope.postMessage(response));
});
