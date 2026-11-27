// Where each shipped dictionary's files are served from (docs/specs/034-text-documents/tools.md "Spelling and
// grammar"): the bundler emits each package's `.aff` and `.dic` as hashed static files, fetched by the spelling worker
// only, the first time its language is checked. Each package exports only its Node reader, so the files are named by
// path through the editor's own node_modules (each package is a dependency of apps/live).
import type { SpellingLanguage } from './spelling-languages';

export const SPELLING_DICTIONARY_FILES: Record<SpellingLanguage, { aff: URL; dic: URL }> = {
  nl: {
    aff: new URL('../../node_modules/dictionary-nl/index.aff', import.meta.url),
    dic: new URL('../../node_modules/dictionary-nl/index.dic', import.meta.url),
  },
  fr: {
    aff: new URL('../../node_modules/dictionary-fr/index.aff', import.meta.url),
    dic: new URL('../../node_modules/dictionary-fr/index.dic', import.meta.url),
  },
};
