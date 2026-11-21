// QUERY's language read into clauses (docs/specs/029-sheets/formulas.md "QUERY"): Google's Visualization API Query
// Language. Keywords ignore case; column names and text keep it. A query that does not read is a QueryFailure.
import { serialFromParts } from '../../dates';

export type QueryValue = number | string | boolean | null;
export type Aggregate = 'avg' | 'count' | 'max' | 'min' | 'sum';
export type Comparison = '=' | '!=' | '<' | '<=' | '>' | '>=';
export type TextMatch = 'contains' | 'starts with' | 'ends with' | 'like' | 'matches';

export type QueryExpr =
  | { k: 'col'; id: string }
  | { k: 'lit'; v: QueryValue }
  | { k: 'agg'; fn: Aggregate; col: string }
  | { k: 'fn'; fn: string; args: QueryExpr[] }
  | { k: 'arith'; op: '+' | '-' | '*' | '/'; a: QueryExpr; b: QueryExpr }
  | { k: 'neg'; a: QueryExpr }
  | { k: 'cmp'; op: Comparison; a: QueryExpr; b: QueryExpr }
  | { k: 'text'; op: TextMatch; a: QueryExpr; b: QueryExpr }
  | { k: 'isNull'; a: QueryExpr; not: boolean }
  | { k: 'logic'; op: 'and' | 'or'; a: QueryExpr; b: QueryExpr }
  | { k: 'not'; a: QueryExpr };

export type Query = {
  // null: `select *` or no select clause.
  select: QueryExpr[] | null;
  where: QueryExpr | null;
  groupBy: QueryExpr[];
  pivot: QueryExpr[];
  orderBy: { e: QueryExpr; desc: boolean }[];
  limit: number | null;
  offset: number;
  labels: { e: QueryExpr; text: string }[];
  formats: { e: QueryExpr; text: string }[];
  options: string[];
};

export class QueryFailure extends Error {
  override readonly name = 'QueryFailure';
}

const AGGREGATES = new Set(['avg', 'count', 'max', 'min', 'sum']);
// Google's scalar functions, by their lower-cased name, with their count of arguments.
export const SCALAR_ARITY: Readonly<Record<string, number>> = {
  year: 1,
  month: 1,
  day: 1,
  hour: 1,
  minute: 1,
  second: 1,
  millisecond: 1,
  quarter: 1,
  dayofweek: 1,
  now: 0,
  datediff: 2,
  todate: 1,
  upper: 1,
  lower: 1,
};

type Token = { k: 'word' | 'quoted' | 'str' | 'num' | 'sym'; v: string };

const SYMBOLS = ['<=', '>=', '!=', '<>', '(', ')', ',', '+', '-', '*', '/', '=', '<', '>'];

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const end = text.indexOf(ch, i + 1);
      if (end < 0) throw new QueryFailure(`Unterminated ${ch === '`' ? 'name' : 'text'}`);
      out.push({ k: ch === '`' ? 'quoted' : 'str', v: text.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(text.slice(i));
    if (num) {
      out.push({ k: 'num', v: num[0] });
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
    if (word) {
      out.push({ k: 'word', v: word[0] });
      i += word[0].length;
      continue;
    }
    const sym = SYMBOLS.find((s) => text.startsWith(s, i));
    if (!sym) throw new QueryFailure(`Unexpected "${ch}"`);
    out.push({ k: 'sym', v: sym === '<>' ? '!=' : sym });
    i += sym.length;
  }
  return out;
}

// The serial of a date, time of day or date-time literal's text.
function dateLiteral(kind: string, text: string): number {
  const date = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  const time = /(\d{1,2}):(\d{2}):(\d{2})(\.\d+)?$/.exec(text);
  const want =
    kind === 'date'
      ? date && text === date[0]
      : kind === 'timeofday'
        ? time && text === time[0]
        : date && time;
  if (!want) throw new QueryFailure(`"${text}" is not a ${kind}`);
  const seconds = time ? Number(time[3]) + Number(time[4] ?? 0) : 0;
  const t = time ? serialFromParts(1899, 12, 30, Number(time[1]), Number(time[2]), seconds) : 0;
  return (date ? serialFromParts(Number(date[1]), Number(date[2]), Number(date[3])) : 0) + t;
}

const CLAUSES = [
  'select',
  'where',
  'group',
  'pivot',
  'order',
  'limit',
  'offset',
  'label',
  'format',
  'options',
];

class Reader {
  private at = 0;
  private readonly toks: Token[];
  constructor(toks: Token[]) {
    this.toks = toks;
  }

  private peek(n = 0): Token | undefined {
    return this.toks[this.at + n];
  }

  private isWord(w: string, n = 0): boolean {
    const t = this.peek(n);
    return t?.k === 'word' && t.v.toLowerCase() === w;
  }

  private isSym(s: string): boolean {
    const t = this.peek();
    return t?.k === 'sym' && t.v === s;
  }

  private take(): Token {
    const t = this.toks[this.at++];
    if (!t) throw new QueryFailure('The query ends too soon');
    return t;
  }

  private expectWord(w: string): void {
    if (!this.isWord(w)) throw new QueryFailure(`Expected "${w}"`);
    this.at++;
  }

  private expectSym(s: string): void {
    if (!this.isSym(s)) throw new QueryFailure(`Expected "${s}"`);
    this.at++;
  }

  private list<T>(item: () => T): T[] {
    const out = [item()];
    while (this.isSym(',')) {
      this.at++;
      out.push(item());
    }
    return out;
  }

  private count(): number {
    const t = this.take();
    if (t.k !== 'num' || !/^\d+$/.test(t.v)) throw new QueryFailure('Expected a whole number');
    return Number(t.v);
  }

  private pairs(): { e: QueryExpr; text: string }[] {
    return this.list(() => {
      const e = this.expr();
      const t = this.take();
      if (t.k !== 'str') throw new QueryFailure('Expected text in quotes');
      return { e, text: t.v };
    });
  }

  query(): Query {
    const q: Query = {
      select: null,
      where: null,
      groupBy: [],
      pivot: [],
      orderBy: [],
      limit: null,
      offset: 0,
      labels: [],
      formats: [],
      options: [],
    };
    let clause = 0;
    while (this.peek()) {
      const word = this.peek()!.k === 'word' ? this.peek()!.v.toLowerCase() : '';
      const next = CLAUSES.indexOf(word, clause);
      if (next < 0) throw new QueryFailure(`Unexpected "${this.peek()!.v}"`);
      clause = next + 1;
      this.at++;
      if (word === 'group' || word === 'order') this.expectWord('by');
      if (word === 'select') {
        if (this.isSym('*')) this.at++;
        else q.select = this.list(() => this.expr());
      } else if (word === 'where') q.where = this.expr();
      else if (word === 'group') q.groupBy = this.list(() => this.expr());
      else if (word === 'pivot') q.pivot = this.list(() => this.expr());
      else if (word === 'order') q.orderBy = this.list(() => this.orderItem());
      else if (word === 'limit') q.limit = this.count();
      else if (word === 'offset') q.offset = this.count();
      else if (word === 'label') q.labels = this.pairs();
      else if (word === 'format') q.formats = this.pairs();
      else q.options = this.list(() => this.take().v.toLowerCase());
    }
    return q;
  }

  private orderItem(): { e: QueryExpr; desc: boolean } {
    const e = this.expr();
    if (this.isWord('desc') || this.isWord('asc'))
      return { e, desc: this.take().v.toLowerCase() === 'desc' };
    return { e, desc: false };
  }

  expr(): QueryExpr {
    let a = this.and();
    while (this.isWord('or')) {
      this.at++;
      a = { k: 'logic', op: 'or', a, b: this.and() };
    }
    return a;
  }

  private and(): QueryExpr {
    let a = this.not();
    while (this.isWord('and')) {
      this.at++;
      a = { k: 'logic', op: 'and', a, b: this.not() };
    }
    return a;
  }

  private not(): QueryExpr {
    if (!this.isWord('not')) return this.comparison();
    this.at++;
    return { k: 'not', a: this.not() };
  }

  private comparison(): QueryExpr {
    const a = this.sum();
    const t = this.peek();
    if (t?.k === 'sym' && ['=', '!=', '<', '<=', '>', '>='].includes(t.v)) {
      this.at++;
      return { k: 'cmp', op: t.v as Comparison, a, b: this.sum() };
    }
    if (this.isWord('is')) {
      this.at++;
      const not = this.isWord('not');
      if (not) this.at++;
      this.expectWord('null');
      return { k: 'isNull', a, not };
    }
    for (const op of ['contains', 'like', 'matches', 'starts', 'ends'] as const) {
      if (!this.isWord(op)) continue;
      this.at++;
      if (op === 'starts' || op === 'ends') this.expectWord('with');
      const full = op === 'starts' ? 'starts with' : op === 'ends' ? 'ends with' : op;
      return { k: 'text', op: full, a, b: this.sum() };
    }
    return a;
  }

  private sum(): QueryExpr {
    let a = this.product();
    while (this.isSym('+') || this.isSym('-')) {
      const op = this.take().v as '+' | '-';
      a = { k: 'arith', op, a, b: this.product() };
    }
    return a;
  }

  private product(): QueryExpr {
    let a = this.unary();
    while (this.isSym('*') || this.isSym('/')) {
      const op = this.take().v as '*' | '/';
      a = { k: 'arith', op, a, b: this.unary() };
    }
    return a;
  }

  private unary(): QueryExpr {
    if (!this.isSym('-')) return this.primary();
    this.at++;
    return { k: 'neg', a: this.unary() };
  }

  private primary(): QueryExpr {
    const t = this.take();
    if (t.k === 'num') return { k: 'lit', v: Number(t.v) };
    if (t.k === 'str') return { k: 'lit', v: t.v };
    if (t.k === 'quoted') return { k: 'col', id: t.v };
    if (t.k === 'sym') {
      if (t.v !== '(') throw new QueryFailure(`Unexpected "${t.v}"`);
      const e = this.expr();
      this.expectSym(')');
      return e;
    }
    const lower = t.v.toLowerCase();
    if (lower === 'true' || lower === 'false') return { k: 'lit', v: lower === 'true' };
    if (['date', 'timeofday', 'datetime', 'timestamp'].includes(lower) && this.peek()?.k === 'str')
      return {
        k: 'lit',
        v: dateLiteral(lower === 'timestamp' ? 'datetime' : lower, this.take().v),
      };
    if (!this.isSym('(')) return { k: 'col', id: t.v };
    this.at++;
    const args = this.isSym(')') ? [] : this.list(() => this.expr());
    this.expectSym(')');
    if (AGGREGATES.has(lower)) {
      if (args.length !== 1 || args[0]!.k !== 'col')
        throw new QueryFailure(`${lower} takes one column`);
      return { k: 'agg', fn: lower as Aggregate, col: args[0].id };
    }
    if (SCALAR_ARITY[lower] !== args.length) throw new QueryFailure(`Unknown function ${t.v}`);
    return { k: 'fn', fn: lower, args };
  }
}

/** A query's clauses, or a QueryFailure naming what does not read. */
export function parseQuery(text: string): Query {
  return new Reader(tokenize(text)).query();
}
