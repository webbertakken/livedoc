// An equation's maths (docs/specs/034-text-documents/objects.md "The equation model"): a row of tokens and
// structures, the part of MathML and OMML both formats share.
import { EQUATION_MAX_DEPTH, EQUATION_MAX_NODES } from '../limits';
import type { KeptProperties, TextProps } from './props';

export type MathTokenKind = 'identifier' | 'number' | 'operator' | 'text';
export const MATH_TOKEN_KINDS: readonly MathTokenKind[] = [
  'identifier',
  'number',
  'operator',
  'text',
];

/** Characters drawn as one: a letter or upright word, a number, an operator, or words drawn as text. */
export type MathToken = { readonly kind: MathTokenKind; readonly text: string };
export type MathFraction = {
  readonly kind: 'fraction';
  readonly numerator: MathRow;
  readonly denominator: MathRow;
};
/** A base with a subscript, a superscript, or both. */
export type MathScripts = {
  readonly kind: 'scripts';
  readonly base: MathRow;
  readonly sub?: MathRow;
  readonly sup?: MathRow;
};
/** A radicand under the radical sign; an index makes it an nth root. */
export type MathRoot = {
  readonly kind: 'root';
  readonly radicand: MathRow;
  readonly index?: MathRow;
};
/** A sum, product, integral … with its limits, either empty for none, and the body it applies to. */
export type MathLargeOperator = {
  readonly kind: 'large-operator';
  readonly operator: string;
  readonly lower: MathRow;
  readonly upper: MathRow;
  readonly body: MathRow;
};
/** A body between an opening and a closing character, either '' for none. */
export type MathFence = {
  readonly kind: 'fence';
  readonly open: string;
  readonly close: string;
  readonly body: MathRow;
};
export type MathAccent = {
  readonly kind: 'accent';
  readonly base: MathRow;
  readonly accent: string;
};
/** A base with a row under it, over it, or both (`lim` with `a→b` under it). */
export type MathUnderOver = {
  readonly kind: 'under-over';
  readonly base: MathRow;
  readonly under?: MathRow;
  readonly over?: MathRow;
};
export type MathNode =
  | MathToken
  | MathFraction
  | MathScripts
  | MathRoot
  | MathLargeOperator
  | MathFence
  | MathAccent
  | MathUnderOver;
export type MathRow = readonly MathNode[];

/** An equation in its paragraph, with the formatting and link of the run it sits in. */
export type Equation = {
  readonly type: 'equation';
  readonly math: MathRow;
  readonly props: TextProps;
  readonly style?: string;
  readonly link?: string;
  readonly kept?: KeptProperties;
};

/** Large operators: integrals take their limits as scripts beside the sign, the others under and over it. */
export const INTEGRALS = new Set(['∫', '∬', '∭', '∮', '∯', '∰']);
export const LARGE_OPERATORS = new Set([
  '∑',
  '∏',
  '∐',
  '⋂',
  '⋃',
  '⋀',
  '⋁',
  '⨁',
  '⨂',
  '⨀',
  ...INTEGRALS,
]);
/** Characters a fence opens and closes with; `|` and `‖` do both. */
export const FENCE_OPENERS = new Set(['(', '[', '{', '⟨', '|', '‖', '⌊', '⌈']);
export const FENCE_CLOSERS = new Set([')', ']', '}', '⟩', '|', '‖', '⌋', '⌉']);
/** Characters drawn over a base as its accent. */
export const ACCENTS = new Set([
  '^',
  'ˆ',
  '\u0302',
  '~',
  '˜',
  '\u0303',
  '¯',
  '‾',
  '\u0304',
  '\u0305',
  '→',
  '\u20d7',
  '˙',
  '\u0307',
  '¨',
  '\u0308',
  '´',
  '`',
  '˘',
  'ˇ',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isChars = (value: unknown): value is string => isText(value) && value.length > 0;

/** A row read from a value, or undefined at the first thing the model does not hold. */
function rowOf(value: unknown): MathRow | undefined {
  if (!Array.isArray(value)) return undefined;
  const row: MathNode[] = [];
  for (const item of value) {
    const node = nodeOf(item);
    if (!node) return undefined;
    row.push(node);
  }
  return row;
}

/** An optional row: absent is fine, present must be a row. */
function optionalRow(value: unknown): MathRow | undefined | false {
  if (value === undefined) return undefined;
  return rowOf(value) ?? false;
}

function nodeOf(value: unknown): MathNode | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value.kind;
  if (MATH_TOKEN_KINDS.includes(kind as MathTokenKind))
    return isChars(value.text) ? { kind: kind as MathTokenKind, text: value.text } : undefined;
  switch (kind) {
    case 'fraction': {
      const numerator = rowOf(value.numerator);
      const denominator = rowOf(value.denominator);
      return numerator && denominator ? { kind, numerator, denominator } : undefined;
    }
    case 'scripts': {
      const base = rowOf(value.base);
      const sub = optionalRow(value.sub);
      const sup = optionalRow(value.sup);
      if (!base || sub === false || sup === false || (!sub && !sup)) return undefined;
      return { kind, base, ...(sub ? { sub } : {}), ...(sup ? { sup } : {}) };
    }
    case 'root': {
      const radicand = rowOf(value.radicand);
      const index = optionalRow(value.index);
      if (!radicand || index === false) return undefined;
      return { kind, radicand, ...(index ? { index } : {}) };
    }
    case 'large-operator': {
      const body = rowOf(value.body);
      const lower = rowOf(value.lower);
      const upper = rowOf(value.upper);
      if (!isChars(value.operator) || !body || !lower || !upper) return undefined;
      return { kind, operator: value.operator, lower, upper, body };
    }
    case 'fence': {
      const body = rowOf(value.body);
      if (!isText(value.open) || !isText(value.close) || !body) return undefined;
      return { kind, open: value.open, close: value.close, body };
    }
    case 'accent': {
      const base = rowOf(value.base);
      return base && isChars(value.accent) ? { kind, base, accent: value.accent } : undefined;
    }
    case 'under-over': {
      const base = rowOf(value.base);
      const under = optionalRow(value.under);
      const over = optionalRow(value.over);
      if (!base || under === false || over === false || (!under && !over)) return undefined;
      return { kind, base, ...(under ? { under } : {}), ...(over ? { over } : {}) };
    }
    default:
      return undefined;
  }
}

/** The names of the rows a node holds, in reading order: the order the caret walks them. */
const ROW_KEYS: Readonly<Record<string, readonly string[]>> = {
  fraction: ['numerator', 'denominator'],
  scripts: ['base', 'sub', 'sup'],
  root: ['index', 'radicand'],
  'large-operator': ['lower', 'upper', 'body'],
  fence: ['body'],
  accent: ['base'],
  'under-over': ['base', 'under', 'over'],
};

/** The rows a node holds, by name, in reading order; a token holds none. */
export function childRowKeys(node: MathNode): string[] {
  const record = node as unknown as Record<string, unknown>;
  return (ROW_KEYS[node.kind] ?? []).filter((key) => record[key] !== undefined);
}

/** The rows a node holds, in reading order. */
export const childRows = (node: MathNode): MathRow[] =>
  childRowKeys(node).map((key) => (node as unknown as Record<string, MathRow>)[key]!);

/** The node with one of its rows, by its place in reading order, replaced. */
export function withChildRow(node: MathNode, index: number, row: MathRow): MathNode {
  const key = childRowKeys(node)[index];
  return key === undefined ? node : { ...node, [key]: row };
}

function sizeOf(row: MathRow): { nodes: number; depth: number } {
  let nodes = 0;
  let depth = 0;
  for (const node of row) {
    nodes += 1;
    let inner = 0;
    for (const child of childRows(node)) {
      const size = sizeOf(child);
      nodes += size.nodes;
      inner = Math.max(inner, size.depth);
    }
    depth = Math.max(depth, 1 + inner);
  }
  return { nodes, depth };
}

/** A row as text: itself when one token, else in brackets. */
function grouped(row: MathRow): string {
  const text = linear(row);
  return row.length === 1 && row[0]!.kind !== 'fraction' && text.length > 0 ? text : `(${text})`;
}

function linear(row: MathRow): string {
  return row.map(linearNode).join('');
}

function linearNode(node: MathNode): string {
  switch (node.kind) {
    case 'fraction':
      return `${grouped(node.numerator)}/${grouped(node.denominator)}`;
    case 'scripts':
      return `${grouped(node.base)}${node.sub ? `_${grouped(node.sub)}` : ''}${node.sup ? `^${grouped(node.sup)}` : ''}`;
    case 'root':
      return node.index
        ? `√(${linear(node.index)}&${linear(node.radicand)})`
        : `√${grouped(node.radicand)}`;
    case 'large-operator':
      return `${node.operator}${node.lower.length > 0 ? `_${grouped(node.lower)}` : ''}${node.upper.length > 0 ? `^${grouped(node.upper)}` : ''} ${linear(node.body)}`;
    case 'fence':
      return `${node.open}${linear(node.body)}${node.close}`;
    case 'accent':
      return `${grouped(node.base)}${node.accent}`;
    case 'under-over':
      return `${grouped(node.base)}${node.under ? `_${grouped(node.under)}` : ''}${node.over ? `^${grouped(node.over)}` : ''}`;
    default:
      return node.text;
  }
}

const NUMBER = /^\d+(?:\.\d+)?/u;
const WORD = /^\p{L}+/u;
const LETTER = /^\p{L}/u;

export const Equations = {
  /** An equation's maths from a value (a live attribute, a pasted fragment), when the model holds it whole. */
  of: (value: unknown): MathRow | undefined => {
    const row = rowOf(value);
    if (!row) return undefined;
    const { nodes, depth } = sizeOf(row);
    return nodes <= EQUATION_MAX_NODES && depth <= EQUATION_MAX_DEPTH ? row : undefined;
  },
  /** How many nodes a row holds, and how deep they nest. */
  size: sizeOf,
  /** Whether a row is within the limits, so a format's reader holds it rather than keeping it. */
  within: (row: MathRow): boolean => {
    const { nodes, depth } = sizeOf(row);
    return nodes <= EQUATION_MAX_NODES && depth <= EQUATION_MAX_DEPTH;
  },
  /** A typed character as its token: a digit a number, a letter an identifier, anything else an operator. */
  token: (char: string): MathToken =>
    /^\d$/u.test(char)
      ? { kind: 'number', text: char }
      : /^\p{L}$/u.test(char)
        ? { kind: 'identifier', text: char }
        : { kind: 'operator', text: char },
  /** The linear form, as copied text reads it: `a/b`, `x^2`, `√z`, after UnicodeMath. */
  linear,
  /**
   * An OMML run's characters as tokens: digits with a point a number, an upright word one identifier, each other
   * letter an identifier, each other character an operator, spaces dropped.
   */
  tokens: (text: string, upright: boolean): MathToken[] => {
    const out: MathToken[] = [];
    let rest = text;
    while (rest.length > 0) {
      const number = NUMBER.exec(rest);
      const word = upright ? WORD.exec(rest) : LETTER.exec(rest);
      if (number) out.push({ kind: 'number', text: number[0] });
      else if (word) out.push({ kind: 'identifier', text: word[0] });
      else {
        const char = String.fromCodePoint(rest.codePointAt(0)!);
        if (!/\s/u.test(char)) out.push({ kind: 'operator', text: char });
        rest = rest.slice(char.length);
        continue;
      }
      rest = rest.slice((number ?? word)![0].length);
    }
    return out;
  },
} as const;

/** One step down into a structure: the node's place in its row, and which of its rows, in reading order. */
export type MathStep = { readonly node: number; readonly row: number };

/** A row's place as text: its steps from the equation's row, `node.row` each, joined by `/`; the equation's own is ''. */
export const mathRowId = (path: readonly MathStep[]): string =>
  path.map((s) => `${s.node}.${s.row}`).join('/');
