// What each typing aid makes of the text before the caret (docs/specs/034-text-documents/text-and-paragraphs.md
// "Typing aids"), as pure rules: each reads the paragraph's text up to the caret and answers with the change it asks
// for, or none. The plugin applies them.
import { isSafeLink, type NumberFormat } from '@livedoc/text-documents';
import type { Substitution } from './text-document-typing-aids';

/** What ends a word, so the word aids act: a space (Enter too, as a key); a mark may still be inside an address. */
export const WORD_ENDS = new Set([' ']);

/** The last word of the text: what follows its last space (or the paragraph's start). */
export function lastWord(before: string): { word: string; start: number } {
  const start =
    Math.max(before.lastIndexOf(' '), before.lastIndexOf('\t'), before.lastIndexOf('\n')) + 1;
  return { word: before.slice(start), start };
}

const OPENS_BEFORE = /[\s([{\u2014\u2013\-“‘]$/;

/** Use smart quotes: the curly quote a typed `"` or `'` becomes, from what comes before it. */
export function smartQuote(before: string, quote: '"' | "'"): string {
  const opening = before === '' || OPENS_BEFORE.test(before);
  if (quote === '"') return opening ? '“' : '”';
  return opening ? '‘' : '’';
}

/** Substitutions: the pair whose Replace the word is, if any (the first of the list, as the list is read). */
export function substitutionFor(
  word: string,
  pairs: readonly Substitution[],
): Substitution | undefined {
  return word === '' ? undefined : pairs.find((p) => p.on && p.replace === word);
}

const TRAILING = /[.,;:!?)"'”’]+$/;
const WEB = /^(https?:\/\/[^\s/$.?#][^\s]*|www\.[^\s.]+\.[^\s]+)$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Automatically detect links: the stretch of the word that is an address, and the link it makes; none otherwise. */
export function linkFor(word: string): { length: number; href: string } | undefined {
  const address = word.replace(TRAILING, '');
  if (!address) return undefined;
  let href: string | undefined;
  if (WEB.test(address)) href = /^www\./i.test(address) ? `https://${address}` : address;
  else if (EMAIL.test(address)) href = `mailto:${address}`;
  return href && isSafeLink(href) ? { length: address.length, href } : undefined;
}

/** Words whose dot ends no sentence (default). */
const ABBREVIATIONS = new Set(['e.g.', 'i.e.', 'etc.', 'vs.']);

/** Whether the word starting at `start` of `before` begins a sentence. */
function startsSentence(before: string, start: number): boolean {
  const ahead = before.slice(0, start).replace(/[\s“‘"'(]+$/, '');
  if (ahead === '') return true;
  const spaced = /\s$/.test(before.slice(0, start).replace(/[“‘"'(]+$/, ''));
  if (!/[.!?]$/.test(ahead) || !spaced) return false;
  return !ABBREVIATIONS.has(lastWord(ahead).word.toLowerCase());
}

/**
 * Automatically capitalise words: the word with its first letter a capital, when it starts a sentence or is `i` on
 * its own (`i`, `i'm`); none when it holds a digit, `@`, `/` or a capital already.
 */
export function capitalFor(before: string): { at: number; letter: string } | undefined {
  const { word, start } = lastWord(before);
  const lead = /^[“‘"'(]*/.exec(word)![0].length;
  const body = word.slice(lead);
  if (!/^\p{Ll}/u.test(body) || /[\d@/\p{Lu}]/u.test(body)) return undefined;
  if (/^i(['’](m|ll|d|ve|s))?[.,;:!?]*$/.test(body)) return { at: start + lead, letter: 'I' };
  if (!startsSentence(before, start + lead) || /[.:]\S/.test(body)) return undefined;
  return { at: start + lead, letter: body[0]!.toLocaleUpperCase() };
}

export type ListMarker =
  | { kind: 'bullet'; length: number }
  | { kind: 'number'; length: number; format: NumberFormat; start: number };

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

function romanValue(text: string): number | undefined {
  const lower = text.toLowerCase();
  if (!/^[ivxlcdm]+$/.test(lower)) return undefined;
  let total = 0;
  for (let i = 0; i < lower.length; i += 1) {
    const value = ROMAN[lower[i]!]!;
    const next = ROMAN[lower[i + 1] ?? ''] ?? 0;
    total += value < next ? -value : value;
  }
  return total > 0 ? total : undefined;
}

/**
 * Automatically detect lists: the marker the paragraph's text is (typed before the space that makes it a list), as a
 * bulleted or numbered list in that format from that number; none otherwise.
 */
export function listMarkerFor(text: string): ListMarker | undefined {
  if (text === '-' || text === '*') return { kind: 'bullet', length: text.length };
  const match = /^([0-9]{1,4}|[a-zA-Z]{1,4})[.)]$/.exec(text);
  if (!match) return undefined;
  const label = match[1]!;
  const length = text.length;
  if (/^\d+$/.test(label))
    return { kind: 'number', length, format: 'decimal', start: Number(label) };
  // `i` and `I` alone, and longer Roman numerals, are Roman; another single letter is a letter.
  const roman = romanValue(label);
  if (roman !== undefined && (label.length > 1 || /^[iI]$/.test(label)))
    return {
      kind: 'number',
      length,
      format: label === label.toLowerCase() ? 'lower-roman' : 'upper-roman',
      start: roman,
    };
  if (label.length !== 1) return undefined;
  const lower = label === label.toLowerCase();
  return {
    kind: 'number',
    length,
    format: lower ? 'lower-letter' : 'upper-letter',
    start: label.toLowerCase().charCodeAt(0) - 96,
  };
}

export type MarkdownSpan = {
  /** Where the span starts in the text, and where its inner text starts and ends. */
  readonly start: number;
  readonly innerStart: number;
  readonly innerEnd: number;
  readonly makes: { mark: 'bold' | 'italic' | 'strike' } | { link: string };
};

const MARKDOWN_SPANS: readonly [RegExp, 'bold' | 'italic' | 'strike'][] = [
  [/(\*\*|__)([^*_\s](?:[^*_]*[^*_\s])?)\1$/, 'bold'],
  [/~~([^~\s](?:[^~]*[^~\s])?)~~$/, 'strike'],
  [/(?:^|[^*\w])(\*)([^*\s](?:[^*]*[^*\s])?)\*$/, 'italic'],
  [/(?:^|\W)(_)([^_\s](?:[^_]*[^_\s])?)_$/, 'italic'],
];

/**
 * Enable Markdown: the span the text now ends by closing (`**bold**`, `*italic*`, `_italic_`,
 * `~~strikethrough~~`, `[text](address)`), with where its inner text lies; none otherwise.
 */
export function markdownSpanFor(text: string): MarkdownSpan | undefined {
  const link = /\[([^\]]+)\]\(([^)\s]+)\)$/.exec(text);
  if (link) {
    if (!isSafeLink(link[2]!)) return undefined;
    return {
      start: link.index,
      innerStart: link.index + 1,
      innerEnd: link.index + 1 + link[1]!.length,
      makes: { link: link[2]! },
    };
  }
  for (const [pattern, mark] of MARKDOWN_SPANS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const inner = match.at(-1)!;
    const delimiter = mark === 'strike' ? '~~' : match[1]!;
    const innerEnd = text.length - delimiter.length;
    const innerStart = innerEnd - inner.length;
    return { start: innerStart - delimiter.length, innerStart, innerEnd, makes: { mark } };
  }
  return undefined;
}

/** Enable Markdown: the heading level a paragraph's `#` to `######` marker stands for. */
export const markdownHeadingFor = (text: string): number | undefined =>
  /^#{1,6}$/.test(text) ? text.length : undefined;
