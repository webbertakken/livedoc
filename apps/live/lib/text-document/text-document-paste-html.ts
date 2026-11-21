// HTML from a web page or another editor, read into the writing (docs/specs/034-text-documents/text-and-paragraphs.md
// "Clipboard"): first made plain (whitespace collapsed as a browser draws it, `br` a line break, list items marked
// with their list and level, Word's list paragraphs as list items, loose inline runs wrapped in paragraphs, pictures
// left out), then parsed by rules that read headings, lists, character formatting and paragraph formatting from tags
// and inline CSS. The HTML is read in a detached document, so nothing in it runs or loads.
import { DOMParser, type Schema, type TagParseRule, type StyleParseRule } from 'prosemirror-model';
import {
  isSafeLink,
  LIST_LEVELS,
  type NumberFormat,
  type ParagraphProps,
} from '@livedoc/text-documents';
import { parseInert } from '@livedoc/ui/trusted-types';

/** How a pasted list is drawn at each level its items stand at. */
export type PastedListLevel = { kind: 'bullet' | 'number' | 'check'; format?: NumberFormat };
export type PastedLists = Map<string, Map<number, PastedListLevel>>;

/** The list place a pasted list item names until it is placed: `@paste:<key>`, its list by key. */
export const PASTE_LIST_PREFIX = '@paste:';
/** The style a pasted heading names until it is placed: `@heading<n>`. */
export const PASTE_HEADING_PREFIX = '@heading';

const LIST_ATTRIBUTE = 'data-livedoc-paste-list';

const BLOCKS = new Set(
  (
    'ADDRESS ARTICLE ASIDE BLOCKQUOTE BODY CAPTION CENTER DD DETAILS DIV DL DT FIELDSET FIGCAPTION FIGURE FOOTER ' +
    'FORM H1 H2 H3 H4 H5 H6 HEADER HR LI MAIN NAV OL P PRE SECTION SUMMARY TABLE TBODY TD TFOOT TH THEAD TR UL'
  ).split(' '),
);
// Blocks that are a paragraph of their own; inline runs in other blocks are wrapped in one.
const PARAGRAPHS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI']);
// Blocks whose children are blocks only.
const STRUCTURE = new Set(['OL', 'UL', 'DL', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR']);
const SKIP = new Set(['STYLE', 'META', 'TITLE', 'LINK', 'HEAD']);
const DROP =
  'SCRIPT, TEMPLATE, NOSCRIPT, IFRAME, OBJECT, EMBED, svg, math, input, button, select, textarea';

const isElement = (node: Node): node is HTMLElement => node.nodeType === 1;
const isText = (node: Node): node is Text => node.nodeType === 3;

const ROMAN = /^[ivxlcdm]+$/i;

/** A number format from an `ol`'s `type` or a `list-style-type`. */
function numberFormatOf(type: string | null, style: string): NumberFormat {
  const value = style || type || '';
  if (/^(lower-(alpha|latin)|a)$/.test(value)) return 'lower-letter';
  if (/^(upper-(alpha|latin)|A)$/.test(value)) return 'upper-letter';
  if (/^(lower-roman|i)$/.test(value)) return 'lower-roman';
  if (/^(upper-roman|I)$/.test(value)) return 'upper-roman';
  return 'decimal';
}

/** A Word list marker's number format: `1.`, `a)`, `iv.`; a bullet is anything else. */
function wordMarker(text: string): PastedListLevel {
  const label = text.replace(/\s|\u00a0/g, '').replace(/[.)]$/, '');
  if (/^\d+$/.test(label)) return { kind: 'number', format: 'decimal' };
  if (ROMAN.test(label) && label.length > 1)
    return {
      kind: 'number',
      format: label === label.toLowerCase() ? 'lower-roman' : 'upper-roman',
    };
  if (/^[a-z]$/.test(label)) return { kind: 'number', format: 'lower-letter' };
  if (/^[A-Z]$/.test(label)) return { kind: 'number', format: 'upper-letter' };
  return { kind: 'bullet' };
}

const clampLevel = (level: number) => Math.min(LIST_LEVELS - 1, Math.max(0, level));

type PasteListPlace = { key: string; level: number; checked?: boolean; restart?: number };

function markListItem(
  element: HTMLElement,
  place: PasteListPlace,
  drawn: PastedListLevel,
  lists: PastedLists,
): void {
  const levels = lists.get(place.key) ?? new Map<number, PastedListLevel>();
  if (!levels.has(place.level)) levels.set(place.level, drawn);
  lists.set(place.key, levels);
  element.setAttribute(LIST_ATTRIBUTE, JSON.stringify(place));
}

/** Word's list paragraphs (`mso-list: l0 level1`), their marker spans read for the kind and taken out. */
function readWordLists(body: HTMLElement, lists: PastedLists): void {
  for (const paragraph of body.querySelectorAll<HTMLElement>('p[style*="mso-list"]')) {
    const match = /mso-list:\s*(l\d+)\s+level(\d+)/i.exec(paragraph.getAttribute('style') ?? '');
    const markers = [...paragraph.querySelectorAll<HTMLElement>('[style*="mso-list"]')].filter(
      (span) => /mso-list:\s*ignore/i.test(span.getAttribute('style') ?? ''),
    );
    const drawn = wordMarker(markers.map((m) => m.textContent ?? '').join(''));
    for (const marker of markers) marker.remove();
    if (!match) continue;
    markListItem(
      paragraph,
      { key: `word-${match[1]}`, level: clampLevel(Number(match[2]) - 1) },
      drawn,
      lists,
    );
  }
  for (const marker of body.querySelectorAll<HTMLElement>('[style*="mso-list"]'))
    if (/mso-list:\s*ignore/i.test(marker.getAttribute('style') ?? '')) marker.remove();
}

/** Each `li` marked with its list (its outermost `ul` or `ol`), its level and its kind; its blocks unwrapped. */
function readHtmlLists(body: HTMLElement, lists: PastedLists): void {
  const keys = new Map<Element, string>();
  for (const item of body.querySelectorAll<HTMLElement>('li')) {
    const owners: HTMLElement[] = [];
    for (let at = item.parentElement; at && at !== body; at = at.parentElement)
      if (at.tagName === 'UL' || at.tagName === 'OL') owners.push(at);
    const owner = owners[0];
    const outer = owners.at(-1);
    if (!owner || !outer) continue;
    if (!keys.has(outer)) keys.set(outer, `html-${keys.size + 1}`);
    const box = item.querySelector<HTMLInputElement>(
      ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]',
    );
    const role = item.getAttribute('role') === 'checkbox' || item.hasAttribute('aria-checked');
    const checked = box
      ? box.checked
      : role
        ? item.getAttribute('aria-checked') === 'true'
        : undefined;
    const style =
      (owner.getAttribute('style') ?? '').match(/list-style-type:\s*([\w-]+)/)?.[1] ?? '';
    const drawn: PastedListLevel =
      box || role
        ? { kind: 'check' }
        : owner.tagName === 'OL'
          ? { kind: 'number', format: numberFormatOf(owner.getAttribute('type'), style) }
          : { kind: 'bullet' };
    const start = Number(owner.getAttribute('start'));
    const first = owner.querySelector(':scope > li') === item;
    markListItem(
      item,
      {
        key: keys.get(outer)!,
        level: clampLevel(owners.length - 1),
        ...(checked !== undefined ? { checked } : {}),
        ...(first && owner.tagName === 'OL' && Number.isInteger(start) && start > 1
          ? { restart: start }
          : {}),
      },
      drawn,
      lists,
    );
    box?.remove();
    // An item's paragraphs are its own text: their formatting moves onto the item, a line break between them.
    let joined = false;
    for (const child of [...item.children]) {
      if (!['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(child.tagName)) continue;
      const css = child.getAttribute('style');
      if (css) item.setAttribute('style', `${item.getAttribute('style') ?? ''}; ${css}`);
      if (joined) child.before(item.ownerDocument.createElement('br'));
      child.replaceWith(...child.childNodes);
      joined = true;
    }
  }
}

const preserves = (node: Node, body: HTMLElement): boolean => {
  for (let at = node.parentElement; at && at !== body; at = at.parentElement) {
    if (at.tagName === 'PRE' || at.tagName === 'TEXTAREA') return true;
    if (/pre|break-spaces/.test(at.style.whiteSpace)) return true;
  }
  return false;
};

// The next sibling that is something: past whitespace-only text.
function nextMeaningful(node: Node): Node | null {
  let next = node.nextSibling;
  while (next && isText(next) && !/\S/.test(next.data)) next = next.nextSibling;
  return next;
}

/** Whitespace collapsed as a browser draws it, but where the source keeps it; `br` a line break (`\n`). */
function collapseWhitespace(body: HTMLElement): void {
  let last: Text | null = null;
  let lastKeeps = false;
  let atStart = true;
  const boundary = () => {
    if (last && !lastKeeps) last.data = last.data.replace(/ $/, '');
    if (last && last.data === '') last.remove();
    last = null;
    atStart = true;
  };
  const visit = (parent: Node) => {
    for (const child of [...parent.childNodes]) {
      if (isElement(child)) {
        if (SKIP.has(child.tagName)) continue;
        if (child.tagName === 'BR') {
          const next = nextMeaningful(child);
          // A `br` that ends its block only holds the block open: it is no line break.
          if (!next || (isElement(next) && BLOCKS.has(next.tagName))) child.remove();
          else {
            if (last && !lastKeeps) last.data = last.data.replace(/ $/, '');
            child.replaceWith(child.ownerDocument.createTextNode('\n'));
            last = null;
            atStart = true;
          }
          continue;
        }
        const block = BLOCKS.has(child.tagName);
        if (block) boundary();
        visit(child);
        if (block) boundary();
      } else if (isText(child)) {
        const keeps = preserves(child, body);
        let text = keeps
          ? child.data.replace(/\r\n?/g, '\n')
          : child.data.replace(/[ \t\n\r\f]+/g, ' ');
        if (!keeps && atStart) text = text.replace(/^ /, '');
        if (text === '') {
          child.remove();
          continue;
        }
        child.data = text;
        last = child;
        lastKeeps = keeps;
        atStart = !keeps && text.endsWith(' ');
      } else child.remove();
    }
  };
  visit(body);
  boundary();
}

/** Inline runs straight inside a block that is no paragraph, wrapped in one, so every character is in a paragraph. */
function wrapLooseRuns(body: HTMLElement): void {
  // An inline element around blocks (Google's `<b>` around its paragraphs) holds runs as a block does.
  const holders = new Set<Element>();
  for (const element of body.querySelectorAll('*')) {
    if (!BLOCKS.has(element.tagName)) continue;
    for (
      let at = element.parentElement;
      at && at !== body && !holders.has(at);
      at = at.parentElement
    )
      holders.add(at);
  }
  const isBlock = (e: Element) => BLOCKS.has(e.tagName) || holders.has(e);
  const containers = [body, ...body.querySelectorAll<HTMLElement>('*')].filter(
    (e) => (e === body || isBlock(e)) && !PARAGRAPHS.has(e.tagName) && !STRUCTURE.has(e.tagName),
  );
  for (const container of containers) {
    let run: ChildNode[] = [];
    const flush = () => {
      if (run.some((n) => !isText(n) || /\S/.test(n.data))) {
        const paragraph = container.ownerDocument.createElement('p');
        const css = container === body ? null : container.getAttribute('style');
        if (css) paragraph.setAttribute('style', css);
        run[0]!.before(paragraph);
        paragraph.append(...run);
      } else for (const n of run) n.remove();
      run = [];
    };
    for (const child of [...container.childNodes]) {
      const inline =
        isText(child) || (isElement(child) && !isBlock(child) && !SKIP.has(child.tagName));
      if (inline) run.push(child);
      else flush();
    }
    flush();
  }
}

export type NormalisedHtml = { html: string; lists: PastedLists; pictures: number };

/** Pasted HTML made plain for the parser, its lists and how many pictures were left out. */
export function normalisePastedHtml(html: string): NormalisedHtml {
  // Parsed inert, under the page's Trusted Types (docs/specs/016-platform/trusted-types.md).
  const document = parseInert(html, 'text/html');
  const body = document.body;
  // A Word page's class rules, kept for the parser, which applies them to the elements they name.
  body.prepend(...document.head.querySelectorAll('style'));
  for (const element of body.querySelectorAll(DROP)) element.remove();
  const pictures = body.querySelectorAll('img, picture, video').length;
  for (const element of body.querySelectorAll('img, picture, video')) element.remove();
  // Comments carry nothing, and Word's conditional ones hide its list markers' wrappers.
  const comments = document.createTreeWalker(body, 128);
  const found: Node[] = [];
  while (comments.nextNode()) found.push(comments.currentNode);
  for (const comment of found) comment.parentNode?.removeChild(comment);
  for (const pre of body.querySelectorAll<HTMLElement>('pre')) {
    const paragraph = document.createElement('p');
    paragraph.setAttribute('style', `${pre.getAttribute('style') ?? ''}; white-space: pre-wrap`);
    paragraph.append(...pre.childNodes);
    pre.replaceWith(paragraph);
  }
  const lists: PastedLists = new Map();
  readWordLists(body, lists);
  readHtmlLists(body, lists);
  collapseWhitespace(body);
  wrapLooseRuns(body);
  return { html: body.innerHTML, lists, pictures };
}

const FACTORS: Record<string, number> = {
  pt: 1,
  px: 0.75,
  in: 72,
  cm: 72 / 2.54,
  mm: 72 / 25.4,
  pc: 12,
};

/** A CSS length in points, to a twentieth; none for a relative or unknown one. */
export function cssLengthPt(value: string): number | undefined {
  const match = /^(-?\d*\.?\d+)(pt|px|in|cm|mm|pc)?$/.exec(value.trim());
  if (!match || (!match[2] && Number(match[1]) !== 0)) return undefined;
  return Math.round(Number(match[1]) * FACTORS[match[2] ?? 'pt']! * 20) / 20;
}

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  purple: '#800080',
  fuchsia: '#ff00ff',
  lime: '#00ff00',
  olive: '#808000',
  navy: '#000080',
  teal: '#008080',
  aqua: '#00ffff',
  orange: '#ffa500',
};

const hex2 = (n: number) =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0');

/** A CSS colour as `#rrggbb`; none for a transparent, relative or unknown one. */
export function cssColourHex(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  let match = /^#([0-9a-f]{3,4})$/.exec(v);
  if (match) {
    const [r, g, b, a] = [...match[1]!].map((c) => c + c);
    return a === '00' ? undefined : `#${r}${g}${b}`;
  }
  match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v);
  if (match) return match[2] === '00' ? undefined : `#${match[1]}`;
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(
    v,
  );
  if (!rgb) return undefined;
  const alpha = rgb[4] === undefined ? 1 : parseFloat(rgb[4]) / (rgb[4].endsWith('%') ? 100 : 1);
  if (alpha === 0) return undefined;
  return `#${hex2(Number(rgb[1]))}${hex2(Number(rgb[2]))}${hex2(Number(rgb[3]))}`;
}

const inRange = (n: number | undefined, min: number, max: number) =>
  n !== undefined && n >= min && n <= max ? n : undefined;

const ALIGN: Record<string, ParagraphProps['align']> = {
  left: 'start',
  start: 'start',
  center: 'center',
  right: 'end',
  end: 'end',
  justify: 'justify',
};

/** A pasted paragraph's formatting from its inline CSS; a list item's indents are its level's. */
export function pastedParagraphProps(
  style: CSSStyleDeclaration,
  inList: boolean,
): ParagraphProps | null {
  const length = (value: string, min: number, max: number) =>
    value ? inRange(cssLengthPt(value), min, max) : undefined;
  const height = style.lineHeight.trim();
  const multiple = /^\d*\.?\d+$/.test(height)
    ? Number(height)
    : /^\d*\.?\d+%$/.test(height)
      ? parseFloat(height) / 100
      : undefined;
  const exact = multiple === undefined && height ? cssLengthPt(height) : undefined;
  const props: ParagraphProps = {
    align: ALIGN[style.textAlign],
    ...(inList
      ? {}
      : {
          indentStart: length(style.marginLeft, -1584, 1584),
          indentFirst: length(style.textIndent, -1584, 1584),
        }),
    indentEnd: length(style.marginRight, -1584, 1584),
    spaceBefore: length(style.marginTop, 0, 1584),
    spaceAfter: length(style.marginBottom, 0, 1584),
    lineHeight:
      multiple !== undefined && multiple > 0 && multiple < 100
        ? { rule: 'multiple', value: multiple }
        : exact !== undefined && exact > 0 && exact <= 1584
          ? { rule: 'atLeast', pt: exact }
          : undefined,
  };
  const set = Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined));
  return Object.keys(set).length > 0 ? set : null;
}

function pastedListPlace(element: HTMLElement) {
  const raw = element.getAttribute(LIST_ATTRIBUTE);
  if (!raw) return null;
  const { key, level, checked, restart } = JSON.parse(raw) as PasteListPlace;
  return {
    id: `${PASTE_LIST_PREFIX}${key}`,
    level,
    ...(checked !== undefined ? { checked } : {}),
    ...(restart !== undefined ? { restart } : {}),
  };
}

const paragraphAttrs = (element: HTMLElement, style: string | null) => {
  const list = pastedListPlace(element);
  return {
    style,
    props: pastedParagraphProps(element.style, list !== null),
    list,
    text: null,
    kept: null,
  };
};

const BOLD = /^(bold(er)?|[6-9]\d\d)$/;
const NOT_BOLD = /^(normal|lighter|[1-5]\d\d)$/;
const GENERIC =
  /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[\w-]+|inherit|initial|unset|-.*)$/i;
const FONT_NAME_MAX = 100;
const SIZE_MIN_PT = 1;
const SIZE_MAX_PT = 400;

const on = { value: true };
const value = (v: unknown) => ({ value: v });
const clear = (name: string) => (m: { type: { name: string } }) => m.type.name === name;

/** The rules pasted HTML is read by, for the text document's schema. */
export function pastedHtmlRules(): (TagParseRule | StyleParseRule)[] {
  const headings = [1, 2, 3, 4, 5, 6].map((n): TagParseRule => ({
    tag: `h${n}`,
    node: 'paragraph',
    getAttrs: (e) => paragraphAttrs(e, `${PASTE_HEADING_PREFIX}${n}`),
  }));
  const weightOf = (e: HTMLElement) => e.style.fontWeight;
  // A table's structure (tables.md "In the editor"): rows of cells with their spans; a header row's cells as such.
  const span = (e: HTMLElement, name: string) => {
    const n = Number(e.getAttribute(name));
    return Number.isInteger(n) && n > 1 && n <= 1000 ? n : 1;
  };
  const cell = (e: HTMLElement) => ({ colspan: span(e, 'colspan'), rowspan: span(e, 'rowspan') });
  return [
    { tag: 'table', node: 'table' },
    { tag: 'tr', node: 'table_row' },
    { tag: 'td', node: 'table_cell', getAttrs: cell },
    { tag: 'th', node: 'table_header', getAttrs: cell },
    ...headings,
    { tag: 'li', node: 'paragraph', getAttrs: (e) => paragraphAttrs(e, null) },
    { tag: 'p', node: 'paragraph', getAttrs: (e) => paragraphAttrs(e, null) },
    ...['b', 'strong'].map((tag): TagParseRule => ({
      tag,
      mark: 'bold',
      getAttrs: (e) => (NOT_BOLD.test(weightOf(e)) ? false : on),
    })),
    { style: 'font-weight', mark: 'bold', getAttrs: (v) => (BOLD.test(v) ? on : false) },
    {
      style: 'font-weight',
      clearMark: clear('bold'),
      getAttrs: (v) => (NOT_BOLD.test(v) ? null : false),
    },
    ...['i', 'em'].map((tag): TagParseRule => ({
      tag,
      mark: 'italic',
      getAttrs: (e) => (e.style.fontStyle === 'normal' ? false : on),
    })),
    {
      style: 'font-style',
      mark: 'italic',
      getAttrs: (v) => (/italic|oblique/.test(v) ? on : false),
    },
    { style: 'font-style=normal', clearMark: clear('italic') },
    ...['u', 'ins'].map((tag): TagParseRule => ({ tag, mark: 'underline', attrs: on })),
    ...['s', 'strike', 'del'].map((tag): TagParseRule => ({ tag, mark: 'strike', attrs: on })),
    ...['text-decoration', 'text-decoration-line'].flatMap((style): StyleParseRule[] => [
      {
        style,
        mark: 'underline',
        consuming: false,
        getAttrs: (v) => (/underline/.test(v) ? on : false),
      },
      { style, mark: 'strike', getAttrs: (v) => (/line-through/.test(v) ? on : false) },
    ]),
    { tag: 'sup', mark: 'vertical', attrs: value('super') },
    { tag: 'sub', mark: 'vertical', attrs: value('sub') },
    {
      style: 'vertical-align',
      mark: 'vertical',
      getAttrs: (v) => (v === 'super' || v === 'sub' ? value(v) : false),
    },
    {
      style: 'font-family',
      mark: 'font',
      getAttrs: (v) => {
        const first =
          v
            .split(',')[0]
            ?.trim()
            .replace(/^["']|["']$/g, '') ?? '';
        return first && first.length <= FONT_NAME_MAX && !GENERIC.test(first)
          ? value(first)
          : false;
      },
    },
    {
      style: 'font-size',
      mark: 'size',
      getAttrs: (v) => {
        const pt = cssLengthPt(v);
        return pt !== undefined && pt >= SIZE_MIN_PT && pt <= SIZE_MAX_PT
          ? value(Math.round(pt * 2) / 2)
          : false;
      },
    },
    {
      style: 'color',
      mark: 'color',
      getAttrs: (v) => (cssColourHex(v) ? value(cssColourHex(v)) : false),
    },
    {
      style: 'background-color',
      mark: 'highlight',
      // A web page's white behind its text is no highlight.
      getAttrs: (v) => {
        const hex = cssColourHex(v);
        return hex && hex !== '#ffffff' ? value(hex) : false;
      },
    },
    ...['font-variant', 'font-variant-caps'].map((style): StyleParseRule => ({
      style,
      mark: 'small_caps',
      getAttrs: (v) => (/small-caps/.test(v) ? on : false),
    })),
    {
      style: 'text-transform',
      mark: 'transform',
      getAttrs: (v) =>
        v === 'uppercase' || v === 'lowercase' || v === 'capitalize' ? value(v) : false,
    },
    {
      tag: 'a[href]',
      mark: 'link',
      getAttrs: (e) => {
        const href = e.getAttribute('href') ?? '';
        return isSafeLink(href) ? { href } : false;
      },
    },
  ];
}

/** The parser pasted HTML is read with. */
export const pastedHtmlParser = (schema: Schema) => new DOMParser(schema, pastedHtmlRules());
