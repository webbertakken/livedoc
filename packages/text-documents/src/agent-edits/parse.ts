// A text document changeset's operations read from their text (docs/specs/034-text-documents/agents-and-sync.md "The
// grammar"): one operation a line, words split as an element changeset's line form, blank lines and `#` comments
// skipped. The first line that does not read refuses the changeset, naming what the grammar wanted.
import { isQuotedWord, tokeniseLine, type LineWord } from '@livedoc/api-schema';
import { PARAGRAPH_REF_MARK } from '../model/paragraph-refs';
import {
  SUGGESTIBLE_OPS,
  TABLE_ACTIONS,
  TEXT_MARKS,
  TEXT_OPS_MAX,
  TEXT_OPS_MAX_CHARS,
  type TableAction,
  type TextMark,
  type TextOp,
  type TextOpLine,
  type TextOpName,
  type TextOpRejection,
  type TextTarget,
} from './text-ops';

/** How each operation is written, as a refusal names it. */
export const TEXT_OP_USAGE: Readonly<Record<TextOpName, string>> = {
  edit: 'edit "old" "new"',
  insert: 'insert after|before <¶n or "text"> "<markdown>"',
  append: 'append "<markdown>"',
  prepend: 'prepend "<markdown>"',
  style: 'style <¶n or "text"> "<style>"',
  format: 'format "old" bold|italic|underline|strike|-bold|…|link=<url>|-link …',
  table:
    'table <¶n or "text"> add-row <n>|delete-row <n>|add-column <n>|delete-column <n>|set <row>,<column> "text"',
  comment: 'comment "old" "text"',
  replace: 'replace "<markdown>"',
};

const OP_NAMES = Object.keys(TEXT_OP_USAGE) as TextOpName[];
const isOpName = (word: string): word is TextOpName => (OP_NAMES as string[]).includes(word);

/** `¶12` or `p12`: a paragraph number from 1. */
const PARAGRAPH_NUMBER = /^[0-9]+$/;

/** What a line wanted, thrown from deep in its reading and caught once per line. */
class Refusal extends Error {}

const quoted = (word: LineWord | undefined, what: string): string => {
  if (!word || !isQuotedWord(word)) throw new Refusal(`${what} as a quoted text`);
  return word.value;
};

const match = (word: LineWord | undefined, what: string): string => {
  const text = quoted(word, what);
  if (text === '') throw new Refusal(`${what}, not empty`);
  return text;
};

function target(word: LineWord | undefined): TextTarget {
  if (word && isQuotedWord(word)) return { kind: 'text', text: match(word, 'a target') };
  const raw = word?.value ?? '';
  const digits = raw.startsWith(PARAGRAPH_REF_MARK)
    ? raw.slice(PARAGRAPH_REF_MARK.length)
    : raw.startsWith('p')
      ? raw.slice(1)
      : '';
  const n = PARAGRAPH_NUMBER.test(digits) ? Number(digits) : 0;
  if (n < 1) throw new Refusal('a target: a paragraph number (¶12 or p12) or a quoted text');
  return { kind: 'paragraph', n };
}

const count = (word: LineWord | undefined, what: string, from: number): number => {
  const raw = word && !isQuotedWord(word) ? word.value : '';
  const n = PARAGRAPH_NUMBER.test(raw) ? Number(raw) : -1;
  if (n < from) throw new Refusal(`${what}, a whole number from ${from}`);
  return n;
};

function mark(word: LineWord): TextMark {
  const value = word.value;
  if (value === '-link') return { mark: 'link', href: null };
  if (value.startsWith('link=')) {
    const href = value.slice('link='.length);
    if (href === '') throw new Refusal('link=<url>: an address');
    return { mark: 'link', href };
  }
  const on = !value.startsWith('-');
  const name = on ? value : value.slice(1);
  const known = TEXT_MARKS.find((m) => m === name);
  if (!known || isQuotedWord(word))
    throw new Refusal(
      'a mark: bold, italic, underline, strike, each -bold to take it off, link=<url> or -link',
    );
  return { mark: known, on };
}

function tableAction(words: readonly LineWord[]): TableAction {
  const [name, ...rest] = words;
  if (name?.value === 'set') {
    const place = /^([0-9]+),([0-9]+)$/.exec(rest[0]?.value ?? '');
    const row = Number(place?.[1] ?? 0);
    const column = Number(place?.[2] ?? 0);
    if (!place || row < 1 || column < 1 || isQuotedWord(rest[0]!))
      throw new Refusal('set <row>,<column>: a cell, counted from 1');
    const text = quoted(rest[1], 'the cell’s text');
    if (rest.length > 2) throw new Refusal('nothing after the cell’s text');
    return { action: 'set', row, column, text };
  }
  const action = TABLE_ACTIONS.find((a) => a === name?.value);
  if (!action)
    throw new Refusal('a table operation: add-row, delete-row, add-column, delete-column or set');
  const n = count(
    rest[0],
    action.startsWith('add') ? 'after which (0 for first)' : 'which',
    action.startsWith('add') ? 0 : 1,
  );
  if (rest.length > 1) throw new Refusal(`nothing after ${action} ${n}`);
  return { action, n };
}

const ARITY: Readonly<Record<TextOpName, number>> = {
  edit: 2,
  insert: 3,
  append: 1,
  prepend: 1,
  style: 2,
  format: Infinity,
  table: Infinity,
  comment: 2,
  replace: 1,
};

function operation(name: TextOpName, args: readonly LineWord[]): TextOp {
  if (args.length > ARITY[name]) throw new Refusal('nothing more on the line');
  switch (name) {
    case 'edit': {
      const text = quoted(args[1], 'the new text');
      if (text.includes('\n'))
        throw new Refusal('the new text within one paragraph (insert adds paragraphs)');
      return { op: 'edit', old: match(args[0], 'the text to change'), text };
    }
    case 'insert': {
      const where = args[0]?.value;
      if ((where !== 'after' && where !== 'before') || isQuotedWord(args[0]!))
        throw new Refusal('after or before');
      return {
        op: 'insert',
        where,
        target: target(args[1]),
        markdown: match(args[2], 'the Markdown'),
      };
    }
    case 'append':
    case 'prepend':
      return { op: name, markdown: match(args[0], 'the Markdown') };
    case 'style':
      return { op: 'style', target: target(args[0]), style: match(args[1], 'the style') };
    case 'format': {
      const old = match(args[0], 'the text to format');
      if (args.length < 2) throw new Refusal('at least one mark');
      return { op: 'format', old, marks: args.slice(1).map(mark) };
    }
    case 'table':
      return { op: 'table', target: target(args[0]), action: tableAction(args.slice(1)) };
    case 'comment':
      return {
        op: 'comment',
        old: match(args[0], 'the text to comment on'),
        text: match(args[1], 'the comment'),
      };
    case 'replace':
      return { op: 'replace', markdown: quoted(args[0], 'the Markdown') };
  }
}

const refusal = (line: number, operation: number, message: string): TextOpRejection => ({
  error: 'invalid_operation',
  line,
  operation,
  message,
});

/** One line read as its operation, or why it does not read. */
function readLine(text: string, line: number, index: number): TextOpLine | TextOpRejection {
  const tokens = tokeniseLine(text);
  if ('error' in tokens)
    return refusal(line, index, `column ${tokens.error.column}: expected ${tokens.error.expected}`);
  const words = [...tokens.words];
  const suggest = words[0]?.value === 'suggest' && !isQuotedWord(words[0]);
  if (suggest) words.shift();
  const head = words[0];
  const name = head && !isQuotedWord(head) ? head.value : '';
  if (!isOpName(name))
    return refusal(
      line,
      index,
      `an operation: ${OP_NAMES.join(', ')}${suggest ? '' : ', each may follow suggest'}`,
    );
  if (suggest && !SUGGESTIBLE_OPS.includes(name))
    return refusal(line, index, `suggest comes before ${SUGGESTIBLE_OPS.join(', ')}; not ${name}`);
  try {
    return { line, operation: index, suggest, op: operation(name, words.slice(1)) };
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return refusal(line, index, `${error.message}: ${TEXT_OP_USAGE[name]}`);
  }
}

/** The changeset's operations in order, or the first refusal. */
export function parseTextOps(
  text: string,
): { ok: true; ops: TextOpLine[] } | ({ ok: false } & TextOpRejection) {
  if (text.length > TEXT_OPS_MAX_CHARS)
    return {
      ok: false,
      ...refusal(0, 0, `at most ${TEXT_OPS_MAX_CHARS} characters of operations`),
    };
  const lines = text
    .split('\n')
    .map((source, i) => ({
      source: source.endsWith('\r') ? source.slice(0, -1) : source,
      line: i + 1,
    }))
    .filter(({ source }) => {
      const trimmed = source.trim();
      return trimmed !== '' && !trimmed.startsWith('#');
    });
  if (lines.length === 0) return { ok: false, ...refusal(0, 0, 'at least one operation') };
  if (lines.length > TEXT_OPS_MAX)
    return {
      ok: false,
      ...refusal(0, 0, `at most ${TEXT_OPS_MAX} operations; ${lines.length} given`),
    };
  const ops: TextOpLine[] = [];
  for (const [i, { source, line }] of lines.entries()) {
    const read = readLine(source, line, i + 1);
    if ('error' in read) return { ok: false, ...read };
    ops.push(read);
  }
  const replace = ops.find((o) => o.op.op === 'replace');
  if (replace && ops.length > 1)
    return {
      ok: false,
      ...refusal(replace.line, replace.operation, 'replace stands alone in its changeset'),
    };
  return { ok: true, ops };
}
