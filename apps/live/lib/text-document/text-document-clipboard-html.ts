// The copied HTML other editors read (docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard"): each paragraph
// and run with its formatting written out in place, its styles resolved, headings as `h1` to `h6`, list items as `li`
// in `ul` and `ol`, colours as on white paper. What only LiveDoc can hold (kept content, section breaks) is left out:
// the model fragment carries it.
import {
  DOMSerializer,
  type DOMOutputSpec,
  type Mark,
  type Node as PmNode,
} from 'prosemirror-model';
import {
  isSafeLink,
  Styles,
  TEXT_PROPERTY_MARK_OF,
  type ListLevel,
  type ListPlace,
  type ParagraphProps,
  type Style,
  type StyleDefaults,
  type TextProps,
} from '@livedoc/text-documents';
import type { Lists } from './text-document-lists';
import { borderCss, cssText, pt, textDeclarations, WHITE_PAPER } from './text-document-style-sheet';
import { textDocumentSchema } from './text-document-schema';

/** What the serializer reads the copied writing through: its document's styles, defaults and lists. */
export type ClipboardHtmlContext = {
  readonly styles: readonly Style[];
  readonly defaults: StyleDefaults;
  readonly lists: Lists;
};

const OMIT = 'data-livedoc-omit';
const LIST_ID = 'data-livedoc-list-id';
const LIST_LEVEL = 'data-livedoc-list-level';
const CHECKED = 'data-livedoc-checked';

const ALIGN: Record<NonNullable<ParagraphProps['align']>, string> = {
  start: 'left',
  center: 'center',
  end: 'right',
  justify: 'justify',
};
const SIDES = ['top', 'bottom', 'left', 'right'] as const;

/** A paragraph's formatting as CSS other editors read: real margins, colours as they are. */
export function exportParagraphCss(p: ParagraphProps, inList = false): string {
  const height = p.lineHeight;
  const borders = p.borders ?? {};
  return cssText([
    p.align && Object.hasOwn(ALIGN, p.align) ? `text-align: ${ALIGN[p.align]}` : undefined,
    inList ? undefined : pt(p.indentStart) && `margin-left: ${pt(p.indentStart)}`,
    pt(p.indentEnd) && `margin-right: ${pt(p.indentEnd)}`,
    inList ? undefined : pt(p.indentFirst) && `text-indent: ${pt(p.indentFirst)}`,
    // Written even when none, as Google writes them, so another editor adds no space of its own.
    `margin-top: ${pt(p.spaceBefore) ?? '0pt'}`,
    `margin-bottom: ${pt(p.spaceAfter) ?? '0pt'}`,
    height === undefined
      ? undefined
      : height.rule === 'multiple'
        ? Number.isFinite(height.value) && height.value > 0 && height.value < 100
          ? `line-height: ${height.value}`
          : undefined
        : pt(height.pt) && `line-height: ${pt(height.pt)}`,
    ...SIDES.flatMap((side) => {
      const line = borders[side];
      const drawn = borderCss(line, WHITE_PAPER.ink);
      return drawn === 'none'
        ? []
        : [`border-${side}: ${drawn}`, `padding-${side}: ${pt(line!.space, 72) ?? '0pt'}`];
    }),
    p.shading && /^#[0-9a-f]{6}$/i.test(p.shading) ? `background-color: ${p.shading}` : undefined,
  ]);
}

/** Text formatting as CSS other editors read, colours as they are. */
export const exportTextCss = (t: TextProps): string => cssText(textDeclarations(t, WHITE_PAPER));

const PROPERTY_OF = Object.fromEntries(
  Object.entries(TEXT_PROPERTY_MARK_OF).map(([property, mark]) => [mark, property]),
) as Record<string, keyof TextProps>;

const omitted = (tag: string): DOMOutputSpec => [tag, { [OMIT]: '' }];

/** Bullets as the list-style-type nearest their character; numbers as their format. */
function listStyleOf(level: ListLevel | undefined): string {
  if (!level || level.kind === 'check') return 'none';
  if (level.kind === 'bullet')
    return level.bullet === '○' ? 'circle' : level.bullet === '■' ? 'square' : 'disc';
  return {
    decimal: 'decimal',
    'lower-letter': 'lower-alpha',
    'upper-letter': 'upper-alpha',
    'lower-roman': 'lower-roman',
    'upper-roman': 'upper-roman',
  }[level.format];
}

const isElement = (node: Node): node is HTMLElement => node.nodeType === 1;

/**
 * The list paragraphs, written as `li`, gathered into `ul` and `ol` by list and level: an item deeper than the one
 * before opens a list inside that item, as HTML nests them.
 */
function gatherLists(root: DocumentFragment, lists: Lists): void {
  const document = root.ownerDocument;
  let open: { list: HTMLElement; level: number; id: string }[] = [];
  for (const child of [...root.childNodes]) {
    if (!isElement(child) || !child.hasAttribute(LIST_ID)) {
      open = [];
      continue;
    }
    const id = child.getAttribute(LIST_ID)!;
    const level = Number(child.getAttribute(LIST_LEVEL));
    while (open.length > 0 && (open.at(-1)!.level > level || open.at(-1)!.id !== id)) open.pop();
    const definition = lists[id]?.levels[level];
    if (open.length === 0 || open.at(-1)!.level < level) {
      const list = document.createElement(definition?.kind === 'number' ? 'ol' : 'ul');
      list.setAttribute('style', `list-style-type: ${listStyleOf(definition)}; margin: 0`);
      if (definition?.kind === 'number' && definition.start !== 1)
        list.setAttribute('start', String(definition.start));
      const parent = open.at(-1);
      if (parent) (parent.list.lastElementChild ?? parent.list).append(list);
      else child.before(list);
      open.push({ list, level, id });
    }
    const item = document.createElement('li');
    item.setAttribute('style', child.getAttribute('style') ?? '');
    if (child.hasAttribute(CHECKED)) {
      item.setAttribute('role', 'checkbox');
      item.setAttribute('aria-checked', child.getAttribute(CHECKED)!);
    }
    item.append(...child.childNodes);
    open.at(-1)!.list.append(item);
    child.remove();
  }
}

/** The clipboard's HTML serializer, reading the copied writing's document as it serializes. */
export function clipboardSerializer(read: () => ClipboardHtmlContext): DOMSerializer {
  let context: ClipboardHtmlContext = read();
  const paragraph = (node: PmNode): DOMOutputSpec => {
    const { style, props, list, text } = node.attrs as {
      style: string | null;
      props: ParagraphProps | null;
      list: ListPlace | null;
      text: TextProps | null;
    };
    const id = style ?? undefined;
    const role = Styles.byId(context.styles, id)?.role;
    const heading = role?.startsWith('heading') ? `h${role.slice(-1)}` : 'p';
    const css = [
      exportTextCss({ ...Styles.textPropsOf(context.styles, context.defaults, id), ...text }),
      exportParagraphCss(
        { ...Styles.paragraphPropsOf(context.styles, context.defaults, id), ...props },
        list !== null,
      ),
      'white-space: pre-wrap;',
    ].join(' ');
    return [
      list ? 'p' : heading,
      {
        style: css,
        ...(list
          ? {
              [LIST_ID]: list.id,
              [LIST_LEVEL]: String(list.level),
              ...(list.checked !== undefined ? { [CHECKED]: String(list.checked) } : {}),
            }
          : {}),
      },
      0,
    ];
  };
  const property = (mark: Mark): DOMOutputSpec => [
    'span',
    {
      style: exportTextCss({
        [PROPERTY_OF[mark.type.name]!]: (mark.attrs as { value: unknown }).value,
      }),
    },
    0,
  ];
  const marks: Record<string, (mark: Mark) => DOMOutputSpec> = {
    ...Object.fromEntries(Object.keys(PROPERTY_OF).map((name) => [name, property])),
    link: (mark) => {
      const href = (mark.attrs as { href: unknown }).href;
      return typeof href === 'string' && isSafeLink(href) ? ['a', { href }, 0] : ['span', 0];
    },
    text_style: (mark) => [
      'span',
      {
        style: exportTextCss(
          Styles.textPropsOf(
            context.styles,
            { paragraph: {}, text: {} },
            undefined,
            String(mark.attrs.id),
          ),
        ),
      },
      0,
    ],
    run_kept: () => ['span', 0],
  };
  const nodes: Record<string, (node: PmNode) => DOMOutputSpec> = {
    paragraph,
    section_break: () => omitted('div'),
    kept_block: () => omitted('div'),
    kept_inline: () => omitted('span'),
  };

  class ClipboardSerializer extends DOMSerializer {
    override serializeFragment(
      ...args: Parameters<DOMSerializer['serializeFragment']>
    ): DocumentFragment {
      context = read();
      const out = super.serializeFragment(...args) as DocumentFragment;
      for (const element of out.querySelectorAll(`[${OMIT}]`)) element.remove();
      gatherLists(out, context.lists);
      return out;
    }
  }
  return new ClipboardSerializer(
    { ...DOMSerializer.nodesFromSchema(textDocumentSchema), ...nodes },
    marks,
  );
}
