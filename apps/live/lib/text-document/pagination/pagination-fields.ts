// Page numbers and page counts drawn (docs/specs/034-text-documents/page-layout.md "Page numbers"): each page's number,
// counted from the document's first page, blank ones too, or from the number its section starts at; the page count
// every page laid out; a field in the body showing the page its paragraph starts on.
import type { Node as PmNode } from 'prosemirror-model';
import { Decoration } from 'prosemirror-view';
import { FIELD } from '@livedoc/text-documents';
import type { Pagination } from './pagination';

/** What a field decoration tells its field to show. */
export type FieldShown = {
  readonly fieldShown: { readonly number: number; readonly count: number };
};

/** Each laid page's number as shown, by its start (blank pages counted, never drawn). */
export function shownPageNumbers(
  pagination: Pagination,
  sections: {
    readonly sectionOf: readonly number[];
    readonly starts: readonly (number | undefined)[];
  },
): number[] {
  let shown = 0;
  return pagination.starts.map((start) => {
    shown += start.blank + 1;
    const section = sections.sectionOf[start.block] ?? 0;
    const startsSection =
      start.line === 0 && (start.block === 0 || sections.sectionOf[start.block - 1] !== section);
    const own = sections.starts[section];
    if (startsSection && own !== undefined) shown = own;
    return shown;
  });
}

/** Every page laid out, blank ones too. */
export const pageCountOf = (pagination: Pagination): number =>
  pagination.starts.reduce((count, start) => count + start.blank + 1, 0);

/** The start of the page each block's paragraph starts on. */
export function startOfBlocks(pagination: Pagination, blocks: number): number[] {
  const out: number[] = [];
  let q = 0;
  for (let block = 0; block < blocks; block++) {
    while (
      q + 1 < pagination.starts.length &&
      (pagination.starts[q + 1]!.block < block ||
        (pagination.starts[q + 1]!.block === block && pagination.starts[q + 1]!.line === 0))
    )
      q += 1;
    out.push(q);
  }
  return out;
}

/** A decoration per field in the body, telling it its page's number and the page count. */
export function fieldDecorations(
  nodes: readonly PmNode[],
  positions: readonly number[],
  numberOf: (block: number) => number,
  count: number,
): Decoration[] {
  const decorations: Decoration[] = [];
  nodes.forEach((node, block) => {
    if (!node.isTextblock) return;
    node.descendants((child, offset) => {
      if (child.type.name !== FIELD) return;
      const at = positions[block]! + 1 + offset;
      const number = numberOf(block);
      const shown: FieldShown = { fieldShown: { number, count } };
      // Its key says what it shows, so the layout draws it again when its number or the count changes.
      decorations.push(
        Decoration.node(at, at + 1, {}, { ...shown, key: `field:${number}/${count}` }),
      );
    });
  });
  return decorations;
}
