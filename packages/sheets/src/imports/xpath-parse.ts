// XPath 1.0 read into a tree for IMPORTXML (docs/specs/029-sheets/imports.md "The functions"): every expression of
// the W3C recommendation but variables and the namespace axis. Pure; a query it cannot read is a reason, not a throw.

export type Axis =
  | 'child'
  | 'descendant'
  | 'descendant-or-self'
  | 'self'
  | 'parent'
  | 'ancestor'
  | 'ancestor-or-self'
  | 'attribute'
  | 'following-sibling'
  | 'preceding-sibling'
  | 'following'
  | 'preceding';

const AXES = new Set<string>([
  'child',
  'descendant',
  'descendant-or-self',
  'self',
  'parent',
  'ancestor',
  'ancestor-or-self',
  'attribute',
  'following-sibling',
  'preceding-sibling',
  'following',
  'preceding',
]);

// `name`: an element or attribute name, `*`, or `prefix:*`; `text`, `node`, `comment`: the node-type tests.
export type NodeTest =
  { t: 'name'; name: string } | { t: 'text' } | { t: 'node' } | { t: 'comment' };

export type Step = { axis: Axis; test: NodeTest; preds: XExpr[] };

export type XExpr =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'call'; name: string; args: XExpr[] }
  | { k: 'bin'; op: string; a: XExpr; b: XExpr }
  | { k: 'neg'; a: XExpr }
  // A path from the root (`abs`), from the context node, or from a filtered expression (`from`).
  | { k: 'path'; abs: boolean; from?: XExpr; steps: Step[] }
  | { k: 'filter'; from: XExpr; preds: XExpr[] };

type Tok = { t: 'op' | 'name' | 'num' | 'str' | 'axis' | 'fn' | 'type'; v: string };

const OPS = [
  '//',
  '::',
  '!=',
  '<=',
  '>=',
  '..',
  '/',
  '|',
  '+',
  '-',
  '=',
  '<',
  '>',
  '(',
  ')',
  '[',
  ']',
  '.',
  '@',
  ',',
  '*',
  '$',
];
// The core function library (the recommendation's 4), but id() and lang(), which a page of the web rarely answers.
export const XPATH_FUNCTIONS = new Set(
  'last position count local-name name string concat starts-with contains substring-before substring-after substring string-length normalize-space translate boolean not true false number sum floor ceiling round'.split(
    ' ',
  ),
);
const NODE_TYPES = new Set(['text', 'node', 'comment', 'processing-instruction']);
const NAME =
  /^[A-Za-z_\u00c0-\uffff][\w.\-\u00b7\u00c0-\uffff]*(?::(?:[A-Za-z_\u00c0-\uffff][\w.\-\u00b7\u00c0-\uffff]*|\*))?/;

// After these a `*` or a name is an operand; after anything else an operator (the recommendation's 3.7).
function operandNext(prev: Tok | undefined): boolean {
  if (!prev) return true;
  return prev.t === 'op' && !['..', ')', ']', '.'].includes(prev.v);
}

function lex(src: string): Tok[] | string {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const close = src.indexOf(ch, i + 1);
      if (close < 0) return 'A text in the query is not closed';
      out.push({ t: 'str', v: src.slice(i + 1, close) });
      i = close + 1;
      continue;
    }
    const num = /^(\d+(\.\d*)?|\.\d+)/.exec(src.slice(i));
    if (num) {
      out.push({ t: 'num', v: num[0] });
      i += num[0].length;
      continue;
    }
    const prev = out[out.length - 1];
    const name = NAME.exec(src.slice(i));
    if (name) {
      const rest = src.slice(i + name[0].length).trimStart();
      let v = name[0];
      i += v.length;
      if (!operandNext(prev) && ['and', 'or', 'div', 'mod'].includes(v)) out.push({ t: 'op', v });
      else if (rest.startsWith('::')) {
        if (!AXES.has(v)) return `There is no axis ${v}`;
        out.push({ t: 'axis', v });
      } else if (rest.startsWith('(') && !v.endsWith(':*'))
        out.push({ t: NODE_TYPES.has(v) ? 'type' : 'fn', v });
      else {
        if (v.endsWith(':*')) v = v.slice(0, -1) + '*';
        out.push({ t: 'name', v });
      }
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) return `The query cannot hold ${ch}`;
    if (op === '*' && operandNext(prev)) out.push({ t: 'name', v: '*' });
    else if (op === '$') return 'Variables are not supported';
    else out.push({ t: 'op', v: op });
    i += op.length;
  }
  return out;
}

class Reader {
  private i = 0;
  private readonly toks: Tok[];
  constructor(toks: Tok[]) {
    this.toks = toks;
  }

  peek(n = 0): Tok | undefined {
    return this.toks[this.i + n];
  }
  isOp(v: string): boolean {
    const t = this.peek();
    return t?.t === 'op' && t.v === v;
  }
  take(): Tok {
    const t = this.toks[this.i++];
    if (!t) throw new XPathSyntax('The query ends too soon');
    return t;
  }
  expect(v: string): void {
    const t = this.take();
    if (t.t !== 'op' || t.v !== v) throw new XPathSyntax(`Expected ${v}`);
  }
  done(): boolean {
    return this.i >= this.toks.length;
  }
}

class XPathSyntax extends Error {
  override readonly name = 'XPathSyntax';
}

const LEVELS: string[][] = [
  ['or'],
  ['and'],
  ['=', '!='],
  ['<', '>', '<=', '>='],
  ['+', '-'],
  ['*', 'div', 'mod'],
];

function binary(r: Reader, level: number): XExpr {
  if (level === LEVELS.length) return unary(r);
  let a = binary(r, level + 1);
  for (;;) {
    const t = r.peek();
    const op = t?.t === 'op' ? t.v : null;
    if (!op || !LEVELS[level]!.includes(op)) return a;
    r.take();
    a = { k: 'bin', op, a, b: binary(r, level + 1) };
  }
}

function unary(r: Reader): XExpr {
  if (r.isOp('-')) {
    r.take();
    return { k: 'neg', a: unary(r) };
  }
  let a = pathExpr(r);
  while (r.isOp('|')) {
    r.take();
    a = { k: 'bin', op: '|', a, b: pathExpr(r) };
  }
  return a;
}

function startsStep(t: Tok | undefined): boolean {
  if (!t) return false;
  if (t.t === 'name' || t.t === 'axis' || t.t === 'type') return true;
  return t.t === 'op' && (t.v === '.' || t.v === '..' || t.v === '@');
}

function pathExpr(r: Reader): XExpr {
  const t = r.peek();
  if (t?.t === 'op' && (t.v === '/' || t.v === '//')) {
    r.take();
    const steps: Step[] = t.v === '//' ? [DESCENDANTS] : [];
    if (t.v === '//' || startsStep(r.peek())) steps.push(...relative(r));
    return { k: 'path', abs: true, steps };
  }
  if (startsStep(t)) return { k: 'path', abs: false, steps: relative(r) };
  let from = primary(r);
  const preds = predicates(r);
  if (preds.length > 0) from = { k: 'filter', from, preds };
  if (r.isOp('/') || r.isOp('//')) {
    const steps: Step[] = r.take().v === '//' ? [DESCENDANTS] : [];
    return { k: 'path', abs: false, from, steps: [...steps, ...relative(r)] };
  }
  return from;
}

const DESCENDANTS: Step = { axis: 'descendant-or-self', test: { t: 'node' }, preds: [] };

function relative(r: Reader): Step[] {
  const steps = [step(r)];
  while (r.isOp('/') || r.isOp('//')) {
    if (r.take().v === '//') steps.push(DESCENDANTS);
    steps.push(step(r));
  }
  return steps;
}

function step(r: Reader): Step {
  if (r.isOp('.')) {
    r.take();
    return { axis: 'self', test: { t: 'node' }, preds: [] };
  }
  if (r.isOp('..')) {
    r.take();
    return { axis: 'parent', test: { t: 'node' }, preds: [] };
  }
  let axis: Axis = 'child';
  if (r.isOp('@')) {
    r.take();
    axis = 'attribute';
  } else if (r.peek()?.t === 'axis') {
    axis = r.take().v as Axis;
    r.expect('::');
  }
  const t = r.take();
  let test: NodeTest;
  if (t.t === 'name') test = { t: 'name', name: t.v };
  else if (t.t === 'type') {
    r.expect('(');
    if (r.peek()?.t === 'str') r.take();
    r.expect(')');
    test =
      t.v === 'processing-instruction'
        ? { t: 'comment' }
        : { t: t.v as 'text' | 'node' | 'comment' };
  } else throw new XPathSyntax('A step needs a name or a node test');
  return { axis, test, preds: predicates(r) };
}

function predicates(r: Reader): XExpr[] {
  const out: XExpr[] = [];
  while (r.isOp('[')) {
    r.take();
    out.push(binary(r, 0));
    r.expect(']');
  }
  return out;
}

function primary(r: Reader): XExpr {
  const t = r.take();
  if (t.t === 'num') return { k: 'num', v: Number(t.v) };
  if (t.t === 'str') return { k: 'str', v: t.v };
  if (t.t === 'op' && t.v === '(') {
    const e = binary(r, 0);
    r.expect(')');
    return e;
  }
  if (t.t === 'fn') {
    if (!XPATH_FUNCTIONS.has(t.v)) throw new XPathSyntax(`There is no function ${t.v}()`);
    r.expect('(');
    const args: XExpr[] = [];
    if (!r.isOp(')')) {
      args.push(binary(r, 0));
      while (r.isOp(',')) {
        r.take();
        args.push(binary(r, 0));
      }
    }
    r.expect(')');
    return { k: 'call', name: t.v, args };
  }
  throw new XPathSyntax(`Unexpected ${t.v}`);
}

// The longest query read: far past any a page needs, and short enough that its nesting never runs the stack out.
export const XPATH_LENGTH_MAX = 1_000;

/** A query's tree, or why it cannot be read. */
export function parseXPath(src: string): XExpr | { error: string } {
  if (src.length > XPATH_LENGTH_MAX) return { error: 'The query is too long' };
  const toks = lex(src);
  if (typeof toks === 'string') return { error: toks };
  if (toks.length === 0) return { error: 'The query is empty' };
  const r = new Reader(toks);
  try {
    const e = binary(r, 0);
    if (!r.done()) return { error: `Unexpected ${r.peek()!.v}` };
    return e;
  } catch (e) {
    // Only the reader throws, and only XPathSyntax: the length bound keeps the stack in reach.
    return { error: (e as XPathSyntax).message };
  }
}
