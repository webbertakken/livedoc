// HTML imported (docs/specs/034-text-documents/files-and-print.md "Opening", "Import security"): the page parsed as a
// browser parses it (parse5), its writing read into a new ODF text document: headings, paragraphs, lists and
// checklists, quotes, code blocks, tables with their merged cells, and the formatting an element's own `style` gives.
// Scripts, frames, objects and form controls are never read and are reported; a picture is read only from the page's
// own bytes (a `data:` address), never fetched; an unsafe link keeps its text and is reported.
import {
  isMappedPictureType,
  isPictureTooLarge,
  mediaKeyOf,
  pictureHeader,
  pictureOwnSize,
} from '@livedoc/office-packages';
import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import type { Block, Inline, Paragraph } from '../model/blocks';
import { ListDefinition, type ListLevel, type ListPlace, type NumberFormat } from '../model/lists';
import type { Picture } from '../model/pictures';
import type { ParagraphProps, TextProps } from '../model/props';
import { PageSetup } from '../model/sections';
import { Tables, type Table, type TableCell, type TableRow } from '../model/tables';
import type { TextDocument } from '../model/text-document';
import { pictureText } from '../exports/plain-text';
import { isSafeLink, type ReportBuilder } from '../report';
import { cssColour, paragraphPropsOfStyle, styleDeclarations, textPropsOfStyle } from './html-css';
import { importStyles } from './import-styles';
import { codeLanguageOf } from './markdown';

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

/** Elements whose contents are never read; those that run or show other content are reported. */
const NEVER_READ = new Set(['head', 'style', 'template', 'svg', 'canvas', 'noscript']);
const ACTIVE = new Set(['script', 'iframe', 'frame', 'object', 'embed', 'applet']);
const FORM_CONTROLS = new Set(['input', 'select', 'textarea', 'button']);
/** Elements that hold paragraphs. */
const CONTAINERS = new Set([
  'p',
  'div',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'aside',
  'nav',
  'figure',
  'figcaption',
  'address',
  'dd',
  'dt',
  'dl',
  'body',
  'center',
  'form',
  'fieldset',
  'details',
  'summary',
]);
const HEADINGS = /^h([1-6])$/;
const OL_FORMATS: Readonly<Record<string, NumberFormat>> = {
  '1': 'decimal',
  a: 'lower-letter',
  A: 'upper-letter',
  i: 'lower-roman',
  I: 'upper-roman',
};
/** A picture with no size of its own and none written, in points (default). */
const PICTURE_FALLBACK = { width: 120, height: 90 };
/** How deep a list nests in the model. */
const LIST_LEVEL_MAX = 8;
/** Points a quote is indented (default). */
const QUOTE_INDENT = 36;

const isElement = (node: Node): node is Element => 'tagName' in node;
const attrOf = (element: Element, name: string) =>
  element.attrs.find((a) => a.name === name)?.value;
const childrenOf = (node: Node): Node[] =>
  'content' in node && node.nodeName === 'template'
    ? []
    : 'childNodes' in node
      ? node.childNodes
      : [];

/** What a paragraph being read takes from the elements around it. */
type Para = { readonly style: string; readonly props: ParagraphProps; readonly list?: ListPlace };
/** What text being read takes from the elements around it. */
type Context = { readonly text: TextProps; readonly link?: string };

/** The blocks read so far, and the paragraph being filled. */
type Sink = { blocks: Block[]; inlines: Inline[]; para: Para };

/** A list being read: its id, and its levels as their first items asked. */
type OpenList = {
  id: string;
  level: number;
  ordered: boolean;
  format?: NumberFormat;
  start?: number;
};

const sameRun = (a: Inline, b: Inline) =>
  a.type === 'run' &&
  b.type === 'run' &&
  a.link === b.link &&
  JSON.stringify(a.props) === JSON.stringify(b.props);

/** A paragraph's inlines: runs alike joined, the white space at its edges dropped; none when nothing is left. */
function settled(inlines: readonly Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const inline of inlines) {
    const last = out.at(-1);
    if (last && sameRun(last, inline) && last.type === 'run' && inline.type === 'run')
      out[out.length - 1] = { ...last, text: last.text + inline.text };
    else out.push(inline);
  }
  const first = out[0];
  if (first?.type === 'run') out[0] = { ...first, text: first.text.replace(/^[ \t]+/, '') };
  const end = out.at(-1);
  if (end?.type === 'run') out[out.length - 1] = { ...end, text: end.text.replace(/[ \t]+$/, '') };
  return out.filter((i) => i.type !== 'run' || i.text !== '');
}

export async function readHtmlImport(html: string, report: ReportBuilder): Promise<TextDocument> {
  const tree = parse(html);
  const { blank, styles, normal, heading, code } = importStyles();
  const lists: Record<string, ListDefinition> = {};
  const width = PageSetup.room(blank.section.setup).across;
  const pending = new Map<string, Uint8Array>();
  let language: string | undefined;
  let listCount = 0;
  let open: OpenList | null = null;

  const flush = (sink: Sink) => {
    const inlines = settled(sink.inlines);
    sink.inlines = [];
    if (inlines.length === 0) return;
    sink.blocks.push({
      type: 'paragraph',
      style: sink.para.style,
      props: sink.para.props,
      inlines,
      ...(sink.para.list ? { list: sink.para.list } : {}),
    });
  };

  const textOf = (node: Node): string =>
    node.nodeName === '#text'
      ? (node as DefaultTreeAdapterTypes.TextNode).value
      : isElement(node) && node.tagName === 'br'
        ? '\n'
        : childrenOf(node).map(textOf).join('');

  const contextOf = (element: Element, context: Context): Context => {
    const css = styleDeclarations(attrOf(element, 'style'));
    const own: Record<string, unknown> = { ...textPropsOfStyle(css) };
    const tag = element.tagName;
    if (tag === 'b' || tag === 'strong') own.bold ??= true;
    if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'var') own.italic ??= true;
    if (tag === 'u' || tag === 'ins') own.underline = true;
    if (tag === 's' || tag === 'strike' || tag === 'del') own.strike = true;
    if (tag === 'sup') own.vertical = 'super';
    if (tag === 'sub') own.vertical = 'sub';
    if (tag === 'font') {
      const colour = cssColour(attrOf(element, 'color'));
      if (colour) own.color = colour;
      const face = attrOf(element, 'face')?.split(',')[0]?.trim();
      if (face) own.font = face;
    }
    let link = context.link;
    if (tag === 'a') {
      const href = attrOf(element, 'href')?.trim();
      if (href && isSafeLink(href)) link = href;
      else if (href) report.drop('link', 'unsafe link');
    }
    return { text: { ...context.text, ...(own as TextProps) }, ...(link ? { link } : {}) };
  };

  const paraOf = (element: Element, base: Para): Para => {
    const css = styleDeclarations(attrOf(element, 'style'));
    const align = attrOf(element, 'align')?.toLowerCase();
    const fromAttribute: ParagraphProps =
      align === 'center' || align === 'justify'
        ? { align }
        : align === 'right'
          ? { align: 'end' }
          : align === 'left'
            ? { align: 'start' }
            : {};
    return { ...base, props: { ...base.props, ...fromAttribute, ...paragraphPropsOfStyle(css) } };
  };

  const pictureOf = (element: Element, context: Context): Inline | null => {
    const alt = attrOf(element, 'alt')?.trim();
    const src = attrOf(element, 'src')?.trim() ?? '';
    const data = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(src);
    let bytes: Uint8Array | undefined;
    if (data) {
      try {
        bytes = Uint8Array.from(atob(data[2]!.replace(/\s/g, '')), (c) => c.charCodeAt(0));
      } catch {
        bytes = undefined;
      }
    }
    const header = bytes && pictureHeader(bytes);
    if (!bytes || !header || !isMappedPictureType(header.mediaType) || isPictureTooLarge(bytes)) {
      if (!data) report.drop('external', 'remote picture');
      else report.drop('external', 'unreadable picture');
      return alt === ''
        ? null
        : { type: 'run', text: pictureText(alt, undefined), props: context.text };
    }
    const key = `pending:${pending.size}`;
    pending.set(key, bytes);
    const own = pictureOwnSize(header);
    const w = Number(attrOf(element, 'width'));
    const h = Number(attrOf(element, 'height'));
    const size =
      w > 0 && h > 0
        ? { width: w * 0.75, height: h * 0.75 }
        : w > 0 && own.width > 0
          ? { width: w * 0.75, height: (w * 0.75 * own.height) / own.width }
          : h > 0 && own.height > 0
            ? { width: (h * 0.75 * own.width) / own.height, height: h * 0.75 }
            : own.width > 0 && own.height > 0
              ? own
              : PICTURE_FALLBACK;
    const picture: Picture = {
      type: 'picture',
      media: key,
      width: Math.round(size.width * 100) / 100,
      height: Math.round(size.height * 100) / 100,
      props: context.text,
      ...(alt ? { alt } : alt === '' ? { decorative: true } : {}),
      ...(context.link ? { link: context.link } : {}),
    };
    return picture;
  };

  const listBlocks = (element: Element, sink: Sink, context: Context) => {
    const ordered = element.tagName === 'ol';
    const outer = open;
    const level = outer ? Math.min(LIST_LEVEL_MAX, outer.level + 1) : 0;
    const id = outer ? outer.id : `L${(listCount += 1)}`;
    const startAttr = Number(attrOf(element, 'start'));
    const format = OL_FORMATS[attrOf(element, 'type') ?? ''];
    open = {
      id,
      level,
      ordered,
      ...(format ? { format } : {}),
      ...(Number.isInteger(startAttr) && startAttr !== 1 ? { start: startAttr } : {}),
    };
    let first = true;
    for (const child of childrenOf(element)) {
      if (!isElement(child)) continue;
      if (child.tagName === 'ul' || child.tagName === 'ol') {
        listBlocks(child, sink, context);
        continue;
      }
      if (child.tagName !== 'li') continue;
      const box = findCheckbox(child);
      const kind: ListLevel['kind'] = box ? 'check' : ordered ? 'number' : 'bullet';
      const definition = lists[id] ?? { levels: [...ListDefinition.of(kind).levels] };
      const levels = definition.levels as ListLevel[];
      if (first) {
        const drawn = ListDefinition.of(kind).levels[level]!;
        levels[level] =
          drawn.kind === 'number' && open.format ? { ...drawn, format: open.format } : drawn;
      }
      lists[id] = definition;
      const place: ListPlace = {
        id,
        level,
        ...(box ? { checked: attrOf(box, 'checked') !== undefined } : {}),
        ...(first && open.start !== undefined ? { restart: open.start } : {}),
      };
      first = false;
      flush(sink);
      const saved = sink.para;
      sink.para = { ...paraOf(child, { style: normal, props: {} }), list: place };
      walkChildren(child, sink, context);
      flush(sink);
      sink.para = saved;
    }
    open = outer;
  };

  const findCheckbox = (element: Element): Element | undefined => {
    for (const child of childrenOf(element)) {
      if (!isElement(child)) continue;
      if (child.tagName === 'ul' || child.tagName === 'ol') continue;
      if (child.tagName === 'input' && attrOf(child, 'type')?.toLowerCase() === 'checkbox')
        return child;
      const inner = findCheckbox(child);
      if (inner) return inner;
    }
    return undefined;
  };

  const cellBlocks = (cell: Element, context: Context): Block[] => {
    const sink: Sink = {
      blocks: [],
      inlines: [],
      para: paraOf(cell, { style: normal, props: {} }),
    };
    const saved = open;
    open = null;
    walkChildren(cell, sink, context);
    flush(sink);
    open = saved;
    return sink.blocks.length > 0
      ? sink.blocks
      : [{ type: 'paragraph', style: normal, props: {}, inlines: [] }];
  };

  const tableOf = (element: Element, context: Context): Table | null => {
    const rows: { cells: Element[]; head: boolean }[] = [];
    const collect = (node: Element, head: boolean) => {
      for (const child of childrenOf(node)) {
        if (!isElement(child)) continue;
        if (child.tagName === 'tr')
          rows.push({
            cells: childrenOf(child).filter(
              (c): c is Element => isElement(c) && (c.tagName === 'td' || c.tagName === 'th'),
            ),
            head,
          });
        else if (child.tagName === 'thead') collect(child, true);
        else if (child.tagName === 'tbody' || child.tagName === 'tfoot') collect(child, false);
      }
    };
    collect(element, false);
    if (rows.length === 0) return null;
    const span = (cell: Element, name: string) => {
      const n = Number(attrOf(cell, name));
      return Number.isInteger(n) && n > 1 ? Math.min(n, 1000) : 1;
    };
    const columns = Math.max(
      1,
      ...rows.map((row) => row.cells.reduce((n, cell) => n + span(cell, 'colspan'), 0)),
    );
    let headerRows = rows.findIndex((row) => !row.head);
    if (headerRows < 0) headerRows = rows.length;
    if (headerRows === 0)
      headerRows = rows.findIndex(
        (row) => row.cells.length === 0 || !row.cells.every((c) => c.tagName === 'th'),
      );
    if (headerRows < 0) headerRows = 0;
    const tableRows: TableRow[] = rows.map((row) => ({
      cells: row.cells.map((cell): TableCell => {
        const colSpan = span(cell, 'colspan');
        const rowSpan = span(cell, 'rowspan');
        const css = styleDeclarations(attrOf(cell, 'style'));
        const background = cssColour(css.get('background-color') ?? attrOf(cell, 'bgcolor'));
        return {
          blocks: cellBlocks(cell, context),
          ...(colSpan > 1 ? { colSpan } : {}),
          ...(rowSpan > 1 ? { rowSpan } : {}),
          props: background ? { background } : {},
        };
      }),
    }));
    const shape = Tables.of({ rows: 1, columns, width, style: normal });
    return { ...shape, rows: tableRows, headerRows: Math.min(headerRows, rows.length) };
  };

  const codeBlocks = (element: Element): Paragraph[] => {
    const inner = childrenOf(element).find(
      (c): c is Element => isElement(c) && c.tagName === 'code',
    );
    const classes = `${attrOf(element, 'class') ?? ''} ${inner ? (attrOf(inner, 'class') ?? '') : ''}`;
    const named = /(?:^|\s)(?:language|lang)-([\w+#-]+)/.exec(classes)?.[1] ?? null;
    const style = code(codeLanguageOf(named));
    const text = textOf(element).replace(/^\n/, '').replace(/\n$/, '');
    return text.split('\n').map((line) => ({
      type: 'paragraph',
      style,
      props: {},
      inlines: line ? [{ type: 'run', text: line, props: {} }] : [],
    }));
  };

  function walkChildren(element: Node, sink: Sink, context: Context) {
    for (const child of childrenOf(element)) walk(child, sink, context);
  }

  function walk(node: Node, sink: Sink, context: Context) {
    if (node.nodeName === '#text') {
      const text = (node as DefaultTreeAdapterTypes.TextNode).value.replace(/[\t\n\r ]+/g, ' ');
      if (text)
        sink.inlines.push({
          type: 'run',
          text,
          props: context.text,
          ...(context.link ? { link: context.link } : {}),
        });
      return;
    }
    if (!isElement(node)) return;
    const tag = node.tagName;
    if (tag === 'html') {
      language = attrOf(node, 'lang')?.trim() || language;
      walkChildren(node, sink, context);
      return;
    }
    if (NEVER_READ.has(tag)) return;
    if (ACTIVE.has(tag)) {
      report.drop('active-content', tag);
      return;
    }
    if (FORM_CONTROLS.has(tag)) {
      // A list item's checkbox is its mark, read with the item.
      if (!(
        tag === 'input' &&
        attrOf(node, 'type')?.toLowerCase() === 'checkbox' &&
        sink.para.list
      ))
        report.drop('active-content', 'form control');
      return;
    }
    if (tag === 'br') {
      sink.inlines.push({ type: 'run', text: '\n', props: context.text });
      return;
    }
    if (tag === 'img') {
      const picture = pictureOf(node, context);
      if (picture) sink.inlines.push(picture);
      return;
    }
    if (tag === 'math') {
      sink.inlines.push({ type: 'run', text: textOf(node), props: context.text });
      return;
    }
    const block = (para: Para, inner: () => void) => {
      flush(sink);
      const saved = sink.para;
      sink.para = para;
      inner();
      flush(sink);
      sink.para = saved;
    };
    const own = contextOf(node, context);
    const level = HEADINGS.exec(tag);
    if (level)
      return block(paraOf(node, { style: heading(Number(level[1])), props: {} }), () =>
        walkChildren(node, sink, own),
      );
    if (tag === 'ul' || tag === 'ol') {
      flush(sink);
      listBlocks(node, sink, own);
      return;
    }
    if (tag === 'pre') {
      flush(sink);
      sink.blocks.push(...codeBlocks(node));
      return;
    }
    if (tag === 'table') {
      flush(sink);
      const table = tableOf(node, own);
      if (table) sink.blocks.push(table);
      return;
    }
    if (tag === 'hr') {
      flush(sink);
      return;
    }
    if (tag === 'blockquote') {
      const base = sink.para.list ? { style: normal, props: {} } : sink.para;
      return block(
        paraOf(node, {
          ...base,
          props: { ...base.props, indentStart: (base.props.indentStart ?? 0) + QUOTE_INDENT },
        }),
        () => walkChildren(node, sink, own),
      );
    }
    if (CONTAINERS.has(tag)) {
      // A container inside a list item keeps the item's place; anywhere else it starts a paragraph of its own.
      return block(
        paraOf(node, sink.para.list ? sink.para : { ...sink.para, props: { ...sink.para.props } }),
        () => walkChildren(node, sink, own),
      );
    }
    walkChildren(node, sink, own);
  }

  const root: Sink = { blocks: [], inlines: [], para: { style: normal, props: {} } };
  walkChildren(tree, root, { text: {} });
  flush(root);

  // Each picture's bytes keyed by their SHA-256, as every reader keys a document's media.
  const keys = new Map<string, string>();
  const media: Record<
    string,
    { mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'; bytes: Uint8Array }
  > = {};
  for (const [pendingKey, bytes] of pending) {
    const key = await mediaKeyOf(bytes);
    keys.set(pendingKey, key);
    const mediaType = pictureHeader(bytes)!.mediaType;
    if (isMappedPictureType(mediaType)) media[key] = { mediaType, bytes };
  }
  const rekey = (blocks: readonly Block[]): Block[] =>
    blocks.map((block): Block => {
      if (block.type === 'table')
        return {
          ...block,
          rows: block.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({ ...cell, blocks: rekey(cell.blocks) })),
          })),
        };
      if (block.type !== 'paragraph') return block;
      return {
        ...block,
        inlines: block.inlines.map((i) =>
          i.type === 'picture' ? { ...i, media: keys.get(i.media) ?? i.media } : i,
        ),
      };
    });
  const body = rekey(root.blocks);
  return {
    ...blank,
    styles,
    lists,
    ...(pending.size > 0 ? { media } : {}),
    metadata: { ...blank.metadata, ...(language ? { language } : {}) },
    body: body.length > 0 ? body : blank.body,
  };
}
