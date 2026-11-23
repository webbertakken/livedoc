// Finding a query in a page's text (docs/specs/035-pdf-documents/reading-surface.md "Find": What matches): the text
// and the query are read alike, a run of spaces or a line break as one space and a word the reader saw broken by a
// hyphen at a line's end as one word, then compared, in either case unless asked; never as a regular expression.
// The spans found name units of the text as the reader wrote it, so they are drawn and selected as any span is.
import type { TextSpan } from './text-range';

export type TextFindOptions = { readonly matchCase?: boolean; readonly wholeWords?: boolean };

/** The reader's mark of a word broken by a hyphen at a line's end: no part of what is compared. */
const BROKEN_WORD = '\u0002';
const SPACE = /\s/u;
const WORD = /[\p{L}\p{M}\p{N}]/u;

/** A text as it is compared, and for each of its units the unit of the original it came from. */
type Read = { readonly text: string; readonly from: readonly number[] };

function read(original: string, matchCase: boolean): Read {
  let text = '';
  const from: number[] = [];
  for (let at = 0; at < original.length;) {
    const point = original.codePointAt(at)!;
    const unit = String.fromCodePoint(point);
    const next = at + unit.length;
    if (unit === BROKEN_WORD) {
      at = next;
      continue;
    }
    if (SPACE.test(unit)) {
      // One space for a run: the run's first unit stands for it.
      if (!text.endsWith(' ')) {
        text += ' ';
        from.push(at);
      }
      at = next;
      continue;
    }
    const folded = matchCase ? unit : unit.toLowerCase();
    for (let unitAt = 0; unitAt < folded.length; unitAt += 1) from.push(at);
    text += folded;
    at = next;
  }
  return { text, from };
}

const inWord = (text: string, at: number): boolean =>
  at >= 0 && at < text.length && WORD.test(text[at]!);

export const TextFind = {
  /** Every place `query` is found in `text`, in order, none overlapping; none for an empty query. */
  spans: (text: string, query: string, options: TextFindOptions = {}): TextSpan[] => {
    const matchCase = options.matchCase ?? false;
    const sought = read(query.trim(), matchCase).text;
    if (sought.length === 0) return [];
    const page = read(text, matchCase);
    const spans: TextSpan[] = [];
    for (let at = page.text.indexOf(sought); at >= 0; at = page.text.indexOf(sought, at)) {
      const end = at + sought.length;
      const whole = !inWord(page.text, at - 1) && !inWord(page.text, end);
      if (options.wholeWords && !whole) {
        at += 1;
        continue;
      }
      // The original's units from the first matched to just past the last.
      const last = page.from[end - 1]!;
      spans.push([page.from[at]!, last + String.fromCodePoint(text.codePointAt(last)!).length]);
      at = end;
    }
    return spans;
  },
} as const;
