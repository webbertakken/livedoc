// A page of the web read into a tree for the imports (docs/specs/029-sheets/imports.md "The functions"): HTML read as
// a browser forgives it (unclosed paragraphs, list items and cells, void elements, raw script and style), or XML as
// written. One pass over the text, linear in its length; pure, so the api Worker and tests read pages alike.

export type MarkupElement = {
  kind: 'element';
  // HTML's names are lower case; XML's as written, prefix and all (`dc:creator`).
  name: string;
  attrs: MarkupAttr[];
  children: MarkupNode[];
  parent: MarkupElement | null;
  // Document order, from 0 at the root: an element, then its attributes, then its children.
  order: number;
};
export type MarkupText = { kind: 'text'; text: string; parent: MarkupElement; order: number };
export type MarkupAttr = {
  kind: 'attr';
  name: string;
  value: string;
  parent: MarkupElement;
  order: number;
};
export type MarkupNode = MarkupElement | MarkupText;
export type MarkupMode = 'html' | 'xml';

// The document's root: not an element of the page, the parent of its first one.
export const ROOT_NAME = '#document';

const VOID = new Set(
  'area base br col embed hr img input keygen link meta param source track wbr'.split(' '),
);
const RAW = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed']);
const CLOSES_P = new Set(
  'address article aside blockquote details div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main menu nav ol p pre section table ul dd dt'.split(
    ' ',
  ),
);
// What a start tag closes while it is open, up to (never past) the elements that bound it.
const IMPLIED: Record<string, { closes: Set<string>; bound: Set<string> }> = {
  li: { closes: new Set(['li']), bound: new Set(['ul', 'ol', 'menu']) },
  dt: { closes: new Set(['dt', 'dd']), bound: new Set(['dl']) },
  dd: { closes: new Set(['dt', 'dd']), bound: new Set(['dl']) },
  tr: { closes: new Set(['tr', 'td', 'th']), bound: new Set(['table']) },
  td: { closes: new Set(['td', 'th']), bound: new Set(['tr', 'table']) },
  th: { closes: new Set(['td', 'th']), bound: new Set(['tr', 'table']) },
  thead: {
    closes: new Set(['thead', 'tbody', 'tfoot', 'tr', 'td', 'th']),
    bound: new Set(['table']),
  },
  tbody: {
    closes: new Set(['thead', 'tbody', 'tfoot', 'tr', 'td', 'th']),
    bound: new Set(['table']),
  },
  tfoot: {
    closes: new Set(['thead', 'tbody', 'tfoot', 'tr', 'td', 'th']),
    bound: new Set(['table']),
  },
  option: { closes: new Set(['option']), bound: new Set(['select', 'datalist', 'optgroup']) },
  optgroup: { closes: new Set(['optgroup', 'option']), bound: new Set(['select']) },
};

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  deg: '°',
  times: '×',
  divide: '÷',
  middot: '·',
  bull: '•',
  para: '¶',
  sect: '§',
};

/** Text with its character references read: numeric ones, and the common named ones. */
export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,8});/g, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m;
  });
}

const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function readAttrs(src: string, mode: MarkupMode): [string, string][] {
  const out: [string, string][] = [];
  for (const m of src.matchAll(ATTR)) {
    const name = mode === 'html' ? m[1]!.toLowerCase() : m[1]!;
    if (out.some(([n]) => n === name)) continue;
    out.push([name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')]);
  }
  return out;
}

// Builds the tree as tags arrive: the open elements are a stack, the last the current parent.
class Builder {
  readonly root: MarkupElement = {
    kind: 'element',
    name: ROOT_NAME,
    attrs: [],
    children: [],
    parent: null,
    order: 0,
  };
  private readonly open: MarkupElement[] = [this.root];
  private readonly texts: string[] = [];
  private readonly mode: MarkupMode;

  constructor(mode: MarkupMode) {
    this.mode = mode;
  }

  private get top(): MarkupElement {
    return this.open[this.open.length - 1]!;
  }

  text(raw: string, decode: boolean): void {
    if (raw !== '') this.texts.push(decode ? decodeEntities(raw) : raw);
  }

  private flush(): void {
    if (this.texts.length === 0) return;
    const text = this.texts.join('');
    this.texts.length = 0;
    const parent = this.top;
    const last = parent.children[parent.children.length - 1];
    if (last?.kind === 'text') last.text += text;
    else parent.children.push({ kind: 'text', text, parent, order: 0 });
  }

  start(name: string, attrSrc: string, selfClosed: boolean): MarkupElement {
    this.flush();
    if (this.mode === 'html') this.imply(name);
    const parent = this.top;
    const el: MarkupElement = { kind: 'element', name, attrs: [], children: [], parent, order: 0 };
    el.attrs = readAttrs(attrSrc, this.mode).map(([n, value]) => ({
      kind: 'attr',
      name: n,
      value,
      parent: el,
      order: 0,
    }));
    parent.children.push(el);
    const empty = this.mode === 'html' ? VOID.has(name) : selfClosed;
    if (!empty) this.open.push(el);
    return el;
  }

  // HTML's end tags left out: a start tag closes the paragraph, item or cell it may not sit in.
  private imply(name: string): void {
    if (CLOSES_P.has(name)) this.closeIfOpen('p', new Set(['table', 'td', 'th', 'li', 'button']));
    const rule = IMPLIED[name];
    if (!rule) return;
    // The outermost it closes, so a new row closes the open row and its cell together.
    let outermost = -1;
    for (let i = this.open.length - 1; i > 0; i--) {
      const at = this.open[i]!.name;
      if (rule.bound.has(at)) break;
      if (rule.closes.has(at)) outermost = i;
    }
    if (outermost > 0) this.open.length = outermost;
  }

  private closeIfOpen(name: string, bound: Set<string>): void {
    for (let i = this.open.length - 1; i > 0; i--) {
      const at = this.open[i]!.name;
      if (at === name) {
        this.open.length = i;
        return;
      }
      if (bound.has(at)) return;
    }
  }

  end(name: string): void {
    this.flush();
    for (let i = this.open.length - 1; i > 0; i--)
      if (this.open[i]!.name === name) {
        this.open.length = i;
        return;
      }
  }

  finish(): MarkupElement {
    this.flush();
    number(this.root);
    return this.root;
  }
}

// Document order, without recursion: an element, its attributes, then its children.
function number(root: MarkupElement): void {
  let n = 0;
  const stack: MarkupNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    node.order = n++;
    if (node.kind === 'text') continue;
    for (const a of node.attrs) a.order = n++;
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!);
  }
}

/** A page's tree: its root holds the page's top elements and text. */
export function parseMarkup(src: string, mode: MarkupMode): MarkupElement {
  const b = new Builder(mode);
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      b.text(src.slice(i), true);
      break;
    }
    if (lt > i) b.text(src.slice(i, lt), true);
    i = lt;
    if (src.startsWith('<!--', i)) {
      const close = src.indexOf('-->', i + 4);
      i = close < 0 ? n : close + 3;
    } else if (src.startsWith('<![CDATA[', i)) {
      const close = src.indexOf(']]>', i + 9);
      b.text(src.slice(i + 9, close < 0 ? n : close), false);
      i = close < 0 ? n : close + 3;
    } else if (src[i + 1] === '!' || src[i + 1] === '?') {
      const close = src.indexOf('>', i);
      i = close < 0 ? n : close + 1;
    } else {
      const m = /^<(\/?)([A-Za-z][^\s/>]*)([^>]*?)(\/?)>/.exec(src.slice(i, i + 4096));
      if (!m) {
        b.text('<', false);
        i++;
        continue;
      }
      i += m[0].length;
      const name = mode === 'html' ? m[2]!.toLowerCase() : m[2]!;
      if (m[1]) {
        b.end(name);
        continue;
      }
      b.start(name, m[3]!, m[4] === '/');
      if (mode === 'html' && RAW.has(name)) {
        const closing = new RegExp(`</${name}`, 'gi');
        closing.lastIndex = i;
        const close = closing.exec(src)?.index ?? -1;
        const body = src.slice(i, close < 0 ? n : close);
        b.text(body, name === 'title' || name === 'textarea');
        b.end(name);
        const gt = close < 0 ? -1 : src.indexOf('>', close);
        i = gt < 0 ? n : gt + 1;
      }
    }
  }
  return b.finish();
}

/** A node's text as XPath's string-value: an element's text nodes joined, in order. */
export function textOf(node: MarkupNode | MarkupAttr): string {
  if (node.kind === 'attr') return node.value;
  if (node.kind === 'text') return node.text;
  const parts: string[] = [];
  const stack: MarkupNode[] = [node];
  while (stack.length > 0) {
    const x = stack.pop()!;
    if (x.kind === 'text') parts.push(x.text);
    else for (let i = x.children.length - 1; i >= 0; i--) stack.push(x.children[i]!);
  }
  return parts.join('');
}

/** Text as a page shows it: runs of white space one space, trimmed. */
export function shownText(s: string): string {
  return s.replace(/[\s\u00a0]+/g, ' ').trim();
}

// Elements a browser sets on lines of their own, so their words never run into their neighbours'.
const BLOCK = new Set(
  'address article aside blockquote br dd div dl dt figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table tbody td tfoot th thead tr ul'.split(
    ' ',
  ),
);

/** A node's text as the page shows it: blocks apart, runs of white space one space, trimmed. */
export function shownTextOf(node: MarkupNode | MarkupAttr): string {
  if (node.kind !== 'element') return shownText(textOf(node));
  const parts: string[] = [];
  const stack: (MarkupNode | ' ')[] = [node];
  while (stack.length > 0) {
    const x = stack.pop()!;
    if (x === ' ' || x.kind === 'text') {
      parts.push(x === ' ' ? ' ' : x.text);
      continue;
    }
    const block = BLOCK.has(x.name);
    if (block) parts.push(' ');
    if (block) stack.push(' ');
    for (let i = x.children.length - 1; i >= 0; i--) stack.push(x.children[i]!);
  }
  return shownText(parts.join(''));
}

/** Every element under `root`, in document order. */
export function elementsOf(root: MarkupElement): MarkupElement[] {
  const out: MarkupElement[] = [];
  const stack: MarkupNode[] = [...root.children].reverse();
  while (stack.length > 0) {
    const x = stack.pop()!;
    if (x.kind !== 'element') continue;
    out.push(x);
    for (let i = x.children.length - 1; i >= 0; i--) stack.push(x.children[i]!);
  }
  return out;
}

export function attrOf(el: MarkupElement, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}
