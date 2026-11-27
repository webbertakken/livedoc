// The words a spelling check reads in a stretch of text (docs/specs/034-text-documents/tools.md "Spelling and
// grammar"): the language's own word breaks, minus what is not checked.

export type CheckableWord = { readonly from: number; readonly to: number; readonly word: string };

/** The longest word checked; longer is a code, a key or a run of letters, never prose. */
export const SPELLING_WORD_MAX = 48;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
const NOT_PROSE = /[\d_@/]/u;
const WEB_ADDRESS = /^(https?:|www\.)/iu;
const TRAILING_APOSTROPHE = /['’]$/u;

/** Whether a word is checked: no digit, underscore, `@` or `/`, not all capitals, not a web address. */
export function isCheckable(word: string): boolean {
  if (word.length === 0 || word.length > SPELLING_WORD_MAX) return false;
  if (NOT_PROSE.test(word) || WEB_ADDRESS.test(word)) return false;
  return !(word.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase());
}

/** The checked words of `text`, each with its UTF-16 offsets. */
export function checkableWords(text: string): CheckableWord[] {
  const found: CheckableWord[] = [];
  let skipTo = -1;
  for (const { segment, index, isWordLike } of segmenter.segment(text)) {
    if (index < skipTo) continue;
    // A web address, a mail address or a path reads as several words: the whole run up to the next space is skipped.
    const run = /^\S+/u.exec(text.slice(index))?.[0] ?? '';
    if (WEB_ADDRESS.test(run) || /[@/]/u.test(run)) {
      skipTo = index + run.length;
      continue;
    }
    if (!isWordLike) continue;
    const word = segment.replace(TRAILING_APOSTROPHE, '');
    if (isCheckable(word)) found.push({ from: index, to: index + word.length, word });
  }
  return found;
}
