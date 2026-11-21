// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Page numbers": pages count from the first, blank ones too, or from the
// number a section starts at; the page count is every page laid out; a body field shows its paragraph's first page.
import { describe, expect, it } from 'vitest';
import { textDocumentSchema as schema } from '../text-document-schema';
import type { Pagination, PageStart } from './pagination';
import {
  fieldDecorations,
  pageCountOf,
  shownPageNumbers,
  startOfBlocks,
  type FieldShown,
} from './pagination-fields';

const start = (block: number, line = 0, blank = 0): PageStart => ({ block, line, gap: 0, blank });
const pagination = (...starts: PageStart[]): Pagination => ({
  starts,
  laidFrom: 0,
  settledAt: null,
});

describe('shownPageNumbers', () => {
  it('counts pages from the first, blank ones too', () => {
    const laid = pagination(start(0), start(2), start(4, 0, 1));
    const sections = { sectionOf: [0, 0, 0, 0, 0], starts: [undefined] };
    expect(shownPageNumbers(laid, sections)).toEqual([1, 2, 4]);
    expect(pageCountOf(laid)).toBe(4);
  });

  it("starts a section's first page at its number, the pages after counting on", () => {
    // Blocks 0-1 section 0 (block 1 its break), 2-4 section 1 starting at 7.
    const sections = { sectionOf: [0, 0, 1, 1, 1], starts: [undefined, 7] };
    expect(shownPageNumbers(pagination(start(0), start(2), start(3)), sections)).toEqual([1, 7, 8]);
    // A page that starts with a later line of the section's first paragraph is not its first.
    expect(shownPageNumbers(pagination(start(0), start(0, 5), start(2)), sections)).toEqual([
      1, 2, 7,
    ]);
    // The document's own start.
    expect(
      shownPageNumbers(pagination(start(0), start(1)), { sectionOf: [0, 0], starts: [3] }),
    ).toEqual([3, 4]);
  });
});

describe('startOfBlocks', () => {
  it('gives each paragraph the page it starts on, a split one its first', () => {
    expect(startOfBlocks(pagination(start(0), start(1, 3), start(3)), 4)).toEqual([0, 0, 1, 2]);
  });
});

describe('fieldDecorations', () => {
  it('tells each field in the body its page number and the page count', () => {
    const field = (kind: string) => schema.nodes.field!.create({ field: kind, text: '0' });
    const nodes = [
      schema.nodes.paragraph!.create(null, [schema.text('Page '), field('page-number')]),
      schema.nodes.paragraph!.create(null, [field('page-count')]),
    ];
    const positions = [0, nodes[0]!.nodeSize];
    const decorations = fieldDecorations(nodes, positions, (block) => block + 4, 9);
    expect(decorations.map((d) => [d.from, d.to, (d.spec as FieldShown).fieldShown])).toEqual([
      [6, 7, { number: 4, count: 9 }],
      [9, 10, { number: 5, count: 9 }],
    ]);
    // Keyed by what it shows, so a renumbered page draws its fields again.
    expect(decorations.map((d) => (d.spec as { key: string }).key)).toEqual([
      'field:4/9',
      'field:5/9',
    ]);
  });
});
