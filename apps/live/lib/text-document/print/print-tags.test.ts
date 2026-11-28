// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import type { LaidOutItem } from '@livedoc/pdf-documents/laid-out';
import { TextDocument } from '@livedoc/text-documents';
import { textDocumentSchema } from '../text-document-schema';
import type { CapturedPage } from './capture-pages';
import { printStructure } from './print-tags';

const STYLES = TextDocument.blank({ format: 'odf' }).styles;
const { nodes } = textDocumentSchema;
const p = (content: string | PmNode[], attrs: Record<string, unknown> = {}) =>
  nodes.paragraph!.create(
    attrs,
    typeof content === 'string' ? (content ? textDocumentSchema.text(content) : null) : content,
  );
const picture = (attrs: Record<string, unknown>) => nodes.picture!.create(attrs);
const cell = (type: 'table_cell' | 'table_header', text: string) =>
  nodes[type]!.create(null, p(text));
const row = (...cells: PmNode[]) => nodes.table_row!.create(null, cells);

const text = (word: string, baseline = 100): LaidOutItem => ({
  kind: 'text',
  x: 72,
  baseline,
  width: 30,
  text: word,
  face: 'f',
  size: 12,
  colour: '#000000',
});
const pictureItem: LaidOutItem = {
  kind: 'picture',
  x: 72,
  y: 200,
  width: 50,
  height: 50,
  bytes: new Uint8Array(),
  format: 'png',
};
const linkItem: LaidOutItem = {
  kind: 'link',
  x: 72,
  y: 90,
  width: 30,
  height: 12,
  to: { uri: 'https://docs.nu/' },
};

/** Pages of items drawn from DOM nodes standing at positions of the writing (null: not the writing's). */
function drawn(pages: [LaidOutItem, number | null, string?][][]) {
  const at = new Map<Node, number | null>();
  const captured: CapturedPage[] = pages.map((items) => ({
    width: 595,
    height: 842,
    items: items.map(([item]) => item),
    sources: items.map(([, pos, wrap]) => {
      const holder = document.createElement('div');
      holder.innerHTML = wrap ?? '<span>x</span>';
      const node = holder.querySelector('[data-source]') ?? holder.firstChild!;
      const source = node.firstChild && node.firstChild.nodeType === 3 ? node.firstChild : node;
      at.set(source, pos);
      return source;
    }),
  }));
  return { captured, positionOf: (node: Node) => at.get(node) ?? null };
}

describe('printStructure', () => {
  it('tags headings and paragraphs, and lists the headings with their page and top', () => {
    const doc = textDocumentSchema.node('doc', null, [
      p('Title', { style: 'Heading_20_1' }),
      p('Body text'),
      p('Next', { style: 'Heading_20_2' }),
    ]);
    const { captured, positionOf } = drawn([
      [
        [text('Title', 50), 1],
        [text('Body'), 8],
        [text('text'), 10],
      ],
      [[text('Next', 80), 19]],
    ]);
    const { tags, outline } = printStructure(captured, doc, STYLES, positionOf);
    expect(tags).toEqual([
      { role: 'H1', kids: [{ item: [0, 0] }] },
      { role: 'P', kids: [{ item: [0, 1] }, { item: [0, 2] }] },
      { role: 'H2', kids: [{ item: [1, 0] }] },
    ]);
    expect(outline).toEqual([
      { title: 'Title', level: 1, page: 0, top: 38 },
      { title: 'Next', level: 2, page: 1, top: 68 },
    ]);
  });

  it('leaves what the writing did not draw untagged', () => {
    const doc = textDocumentSchema.node('doc', null, [p('Body')]);
    const { captured, positionOf } = drawn([
      [
        [text('Header'), null],
        [text('Body'), 1],
      ],
    ]);
    expect(printStructure(captured, doc, STYLES, positionOf).tags).toEqual([
      { role: 'P', kids: [{ item: [0, 1] }] },
    ]);
  });

  it('makes consecutive list paragraphs one list, each marker its label', () => {
    const list = { list: 'L1', level: 0 };
    const doc = textDocumentSchema.node('doc', null, [
      p('One', { list }),
      p('Two', { list }),
      p('After'),
    ]);
    const marker = '<span class="text-document-list-marker" data-source>•</span>';
    const { captured, positionOf } = drawn([
      [
        [text('•'), 1, marker],
        [text('One'), 1],
        [text('•'), 6, marker],
        [text('Two'), 6],
        [text('After'), 11],
      ],
    ]);
    expect(printStructure(captured, doc, STYLES, positionOf).tags).toEqual([
      {
        role: 'L',
        kids: [
          {
            role: 'LI',
            kids: [
              { role: 'Lbl', kids: [{ item: [0, 0] }] },
              { role: 'LBody', kids: [{ item: [0, 1] }] },
            ],
          },
          {
            role: 'LI',
            kids: [
              { role: 'Lbl', kids: [{ item: [0, 2] }] },
              { role: 'LBody', kids: [{ item: [0, 3] }] },
            ],
          },
        ],
      },
      { role: 'P', kids: [{ item: [0, 4] }] },
    ]);
  });

  it('tags a table’s rows and cells, header cells as TH', () => {
    const table = nodes.table!.create(null, [
      row(cell('table_header', 'Name')),
      row(cell('table_cell', 'Ada')),
    ]);
    const doc = textDocumentSchema.node('doc', null, [table]);
    const { captured, positionOf } = drawn([
      [
        [text('Name'), 4],
        [text('Ada'), 14],
      ],
    ]);
    expect(printStructure(captured, doc, STYLES, positionOf).tags).toEqual([
      {
        role: 'Table',
        kids: [
          { role: 'TR', kids: [{ role: 'TH', kids: [{ role: 'P', kids: [{ item: [0, 0] }] }] }] },
          { role: 'TR', kids: [{ role: 'TD', kids: [{ role: 'P', kids: [{ item: [0, 1] }] }] }] },
        ],
      },
    ]);
  });

  it('tags a picture as a figure with its alt text, and a decorative one not at all', () => {
    const doc = textDocumentSchema.node('doc', null, [
      p([picture({ alt: 'A chart', media: 'm1' })]),
      p([picture({ alt: 'Ornament', decorative: true, media: 'm2' })]),
    ]);
    const { captured, positionOf } = drawn([
      [
        [pictureItem, 1],
        [pictureItem, 4],
      ],
    ]);
    expect(printStructure(captured, doc, STYLES, positionOf).tags).toEqual([
      { role: 'P', kids: [{ role: 'Figure', alt: 'A chart', kids: [{ item: [0, 0] }] }] },
    ]);
  });

  it('holds a link’s words and its box in one Link', () => {
    const doc = textDocumentSchema.node('doc', null, [p('See docs here')]);
    const anchor = '<a href="https://docs.nu/" data-source>docs</a>';
    const { captured, positionOf } = drawn([
      [
        [text('See'), 1],
        [text('docs'), 5, anchor],
        [linkItem, 5, '<a href="https://docs.nu/" data-source></a>'],
        [text('here'), 10],
      ],
    ]);
    const [paragraph] = printStructure(captured, doc, STYLES, positionOf).tags;
    expect(paragraph!.kids).toEqual([
      { item: [0, 0] },
      { role: 'Link', kids: [{ item: [0, 1] }] },
      { role: 'Link', kids: [{ item: [0, 2] }] },
      { item: [0, 3] },
    ]);
  });
});
