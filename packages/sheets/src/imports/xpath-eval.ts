// XPath 1.0 worked out over a page's tree (markup.ts) for IMPORTXML (docs/specs/029-sheets/imports.md): node-sets in
// document order, the four value types and their conversions, the core function library. Work is bounded, so a
// query over a large page answers or gives up, never runs on.
import { ROOT_NAME, textOf, type MarkupAttr, type MarkupElement, type MarkupNode } from './markup';
import type { Axis, NodeTest, Step, XExpr } from './xpath-parse';

export type XNode = MarkupNode | MarkupAttr;
export type XValue = XNode[] | string | number | boolean;

// Nodes visited by one query at most: a few seconds of the api Worker's time on a 5 MB page. Safe range 1e6 to 2e7.
export const XPATH_WORK_MAX = 5_000_000;

class TooCostly extends Error {
  override readonly name = 'XPathTooCostly';
  constructor() {
    super('The query is too costly for this page');
  }
}

type Ctx = { node: XNode; pos: number; size: number };

// The reverse axes (ancestor, ancestor-or-self, preceding, preceding-sibling) list their nodes nearest first, so a
// predicate's positions count outward as the recommendation's 2.4 says; a step's answer is put back in document order.

function isNodes(v: XValue): v is XNode[] {
  return Array.isArray(v);
}

function byOrder(nodes: XNode[]): XNode[] {
  const seen = new Set<XNode>();
  const out = nodes.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
  return out.sort((a, b) => a.order - b.order);
}

/** A number as XPath writes it: whole numbers without a point. */
export function numberText(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
  return Object.is(n, -0) ? '0' : String(n);
}

function toStr(v: XValue): string {
  if (isNodes(v)) return v.length > 0 ? textOf(v[0]!) : '';
  if (typeof v === 'number') return numberText(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return v;
}

function strToNum(s: string): number {
  const t = s.trim();
  return /^-?(\d+(\.\d*)?|\.\d+)$/.test(t) ? Number(t) : NaN;
}

function toNum(v: XValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return strToNum(toStr(v));
}

function toBool(v: XValue): boolean {
  if (isNodes(v)) return v.length > 0;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'boolean') return v;
  return v !== '';
}

function nameOf(n: XNode): string {
  return n.kind === 'text' || (n.kind === 'element' && n.name === ROOT_NAME) ? '' : n.name;
}

function matches(test: NodeTest, n: XNode, axis: Axis): boolean {
  if (test.t === 'node') return true;
  if (test.t === 'text') return n.kind === 'text';
  if (test.t === 'comment') return false;
  // A name test picks the axis's principal kind: attributes on the attribute axis, elements elsewhere.
  if (n.kind === 'text' || (n.kind === 'attr') !== (axis === 'attribute') || n.name === ROOT_NAME)
    return false;
  if (test.name === '*') return true;
  if (test.name.endsWith(':*')) return n.name.startsWith(test.name.slice(0, -1));
  return n.name === test.name;
}

class Evaluator {
  private work = 0;
  private all: XNode[] | null = null;
  private readonly ends = new Map<MarkupElement, number>();
  private readonly root: MarkupElement;

  constructor(root: MarkupElement) {
    this.root = root;
  }

  private spend(n: number): void {
    this.work += n;
    if (this.work > XPATH_WORK_MAX) throw new TooCostly();
  }

  // Every element and text in document order (attributes are reached by their axis).
  private everything(): XNode[] {
    if (this.all) return this.all;
    const out: XNode[] = [];
    const stack: MarkupNode[] = [this.root];
    while (stack.length > 0) {
      const x = stack.pop()!;
      out.push(x);
      if (x.kind === 'element')
        for (let i = x.children.length - 1; i >= 0; i--) stack.push(x.children[i]!);
    }
    this.all = out;
    return out;
  }

  // The last order inside a node: its own for text and attributes, its last descendant's for an element.
  private endOf(n: XNode): number {
    if (n.kind !== 'element') return n.order;
    let end = this.ends.get(n);
    if (end === undefined) {
      let last: XNode = n;
      for (;;) {
        const kids: XNode[] = last.kind === 'element' ? [...last.attrs, ...last.children] : [];
        if (kids.length === 0) break;
        last = kids[kids.length - 1]!;
      }
      end = last.order;
      this.ends.set(n, end);
    }
    return end;
  }

  private axis(axis: Axis, n: XNode): XNode[] {
    const el = n.kind === 'element' ? n : null;
    switch (axis) {
      case 'child':
        return el ? el.children : [];
      case 'attribute':
        return el ? el.attrs : [];
      case 'self':
        return [n];
      case 'parent':
        return n.parent ? [n.parent] : [];
      case 'ancestor':
      case 'ancestor-or-self': {
        const out: XNode[] = axis === 'ancestor-or-self' ? [n] : [];
        for (let p = n.parent; p; p = p.parent) out.push(p);
        return out;
      }
      case 'descendant':
      case 'descendant-or-self': {
        const out: XNode[] = axis === 'descendant-or-self' ? [n] : [];
        if (!el) return out;
        const stack: MarkupNode[] = [...el.children].reverse();
        while (stack.length > 0) {
          const x = stack.pop()!;
          out.push(x);
          if (x.kind === 'element')
            for (let i = x.children.length - 1; i >= 0; i--) stack.push(x.children[i]!);
        }
        return out;
      }
      case 'following-sibling':
      case 'preceding-sibling': {
        if (n.kind === 'attr' || !n.parent) return [];
        const sibs = n.parent.children;
        const at = sibs.indexOf(n);
        return axis === 'following-sibling' ? sibs.slice(at + 1) : sibs.slice(0, at).reverse();
      }
      case 'following': {
        const end = this.endOf(n);
        return this.everything().filter((x) => x.order > end);
      }
      case 'preceding': {
        const ancestors = new Set<XNode>(this.axis('ancestor', n));
        return this.everything()
          .filter((x) => x.order < n.order && !ancestors.has(x))
          .reverse();
      }
    }
  }

  private step(nodes: XNode[], s: Step): XNode[] {
    const out: XNode[] = [];
    for (const n of nodes) {
      const along = this.axis(s.axis, n);
      this.spend(along.length + 1);
      let picked = along.filter((x) => matches(s.test, x, s.axis));
      for (const p of s.preds) picked = this.filter(picked, p);
      out.push(...picked);
    }
    return byOrder(out);
  }

  // Nodes kept by a predicate, each at its place among them (in the axis's direction, as given).
  private filter(nodes: XNode[], pred: XExpr): XNode[] {
    return nodes.filter((node, i) => {
      const v = this.eval(pred, { node, pos: i + 1, size: nodes.length });
      return typeof v === 'number' ? v === i + 1 : toBool(v);
    });
  }

  eval(e: XExpr, c: Ctx): XValue {
    this.spend(1);
    switch (e.k) {
      case 'num':
      case 'str':
        return e.v;
      case 'neg':
        return -toNum(this.eval(e.a, c));
      case 'path': {
        let nodes: XNode[];
        if (e.from) {
          const v = this.eval(e.from, c);
          if (!isNodes(v)) throw new TypeError('A path needs nodes to start from');
          nodes = v;
        } else nodes = e.abs ? [this.root] : [c.node];
        for (const s of e.steps) nodes = this.step(nodes, s);
        return nodes;
      }
      case 'filter': {
        const v = this.eval(e.from, c);
        if (!isNodes(v)) throw new TypeError('Only nodes can be filtered');
        let nodes = v;
        for (const p of e.preds) nodes = this.filter(nodes, p);
        return nodes;
      }
      case 'bin':
        return this.binary(e.op, e.a, e.b, c);
      case 'call':
        return this.call(e.name, e.args, c);
    }
  }

  private binary(op: string, ea: XExpr, eb: XExpr, c: Ctx): XValue {
    if (op === 'or') return toBool(this.eval(ea, c)) || toBool(this.eval(eb, c));
    if (op === 'and') return toBool(this.eval(ea, c)) && toBool(this.eval(eb, c));
    const a = this.eval(ea, c);
    const b = this.eval(eb, c);
    if (op === '|') {
      if (!isNodes(a) || !isNodes(b)) throw new TypeError('Only nodes can be joined with |');
      return byOrder([...a, ...b]);
    }
    if (['=', '!=', '<', '>', '<=', '>='].includes(op)) return compare(op, a, b);
    const x = toNum(a);
    const y = toNum(b);
    if (op === '+') return x + y;
    if (op === '-') return x - y;
    if (op === '*') return x * y;
    if (op === 'div') return x / y;
    return x % y;
  }

  private call(name: string, args: XExpr[], c: Ctx): XValue {
    const v = (i: number): XValue => this.eval(args[i]!, c);
    const s = (i: number): string => (args[i] ? toStr(v(i)) : textOf(c.node));
    const nodesArg = (i: number): XNode[] => {
      const x = v(i);
      if (!isNodes(x)) throw new TypeError(`${name}() needs nodes`);
      return x;
    };
    switch (name) {
      case 'last':
        return c.size;
      case 'position':
        return c.pos;
      case 'count':
        return nodesArg(0).length;
      case 'name':
      case 'local-name': {
        const n = args[0] ? nodesArg(0)[0] : c.node;
        const full = n ? nameOf(n) : '';
        return name === 'name' ? full : full.slice(full.indexOf(':') + 1);
      }
      case 'string':
        return s(0);
      case 'concat':
        return args.map((_, i) => toStr(v(i))).join('');
      case 'starts-with':
        return s(0).startsWith(s(1));
      case 'contains':
        return s(0).includes(s(1));
      case 'substring-before': {
        const [a, b] = [s(0), s(1)];
        const at = a.indexOf(b);
        return at < 0 ? '' : a.slice(0, at);
      }
      case 'substring-after': {
        const [a, b] = [s(0), s(1)];
        const at = a.indexOf(b);
        return at < 0 ? '' : a.slice(at + b.length);
      }
      case 'substring': {
        const chars = [...s(0)];
        const from = Math.round(toNum(v(1)));
        const to = args[2] ? from + Math.round(toNum(v(2))) : Infinity;
        return chars.filter((_, i) => i + 1 >= from && i + 1 < to).join('');
      }
      case 'string-length':
        return [...s(0)].length;
      case 'normalize-space':
        return s(0)
          .replace(/[ \t\r\n]+/g, ' ')
          .trim();
      case 'translate': {
        const [src, from, to] = [s(0), [...s(1)], [...s(2)]];
        return [...src]
          .map((ch) => {
            const at = from.indexOf(ch);
            return at < 0 ? ch : (to[at] ?? '');
          })
          .join('');
      }
      case 'boolean':
        return toBool(v(0));
      case 'not':
        return !toBool(v(0));
      case 'true':
        return true;
      case 'false':
        return false;
      case 'number':
        return args[0] ? toNum(v(0)) : strToNum(textOf(c.node));
      case 'sum':
        return nodesArg(0).reduce((t, n) => t + strToNum(textOf(n)), 0);
      case 'floor':
        return Math.floor(toNum(v(0)));
      case 'ceiling':
        return Math.ceil(toNum(v(0)));
      default:
        // round, the last of the library the parser lets through: halves go up, as XPath's do.
        return Math.floor(toNum(v(0)) + 0.5);
    }
  }
}

function compareAtoms(op: string, a: XValue, b: XValue): boolean {
  if (op === '=' || op === '!=') {
    let same: boolean;
    if (typeof a === 'boolean' || typeof b === 'boolean') same = toBool(a) === toBool(b);
    else if (typeof a === 'number' || typeof b === 'number') same = toNum(a) === toNum(b);
    else same = toStr(a) === toStr(b);
    return op === '=' ? same : !same;
  }
  const x = toNum(a);
  const y = toNum(b);
  if (op === '<') return x < y;
  if (op === '>') return x > y;
  if (op === '<=') return x <= y;
  return x >= y;
}

// Node-sets compare by any of their nodes' string-values (the recommendation's 3.4); a boolean by the set's truth.
function compare(op: string, a: XValue, b: XValue): boolean {
  if (isNodes(a) && typeof b === 'boolean') return compareAtoms(op, toBool(a), b);
  if (isNodes(b) && typeof a === 'boolean') return compareAtoms(op, a, toBool(b));
  const as = isNodes(a) ? a.map(textOf) : [a];
  const bs = isNodes(b) ? b.map(textOf) : [b];
  return as.some((x) => bs.some((y) => compareAtoms(op, x, y)));
}

/** What a query answers over a page, or why it gives none. */
export function evaluateXPath(expr: XExpr, root: MarkupElement): XValue | { error: string } {
  const ev = new Evaluator(root);
  try {
    return ev.eval(expr, { node: root, pos: 1, size: 1 });
  } catch (e) {
    // Only TooCostly and the TypeErrors of a value of the wrong kind are thrown here (parseXPath bounds the nesting).
    return { error: (e as Error).message };
  }
}
