// docs/specs/034-text-documents/page-layout.md "Each page is drawn at its section's setup": the body's sections, the
// section a place is in, and a section's writing drawn at its own width and place.
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { PageSetup } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '../text-document-schema';
import {
  bodySections,
  SECTIONS_CHANGED,
  sectionAt,
  sectionInset,
  sectionWidths,
  sectionWidthsPlugin,
} from './pagination-sections';

const letter = PageSetup.of('letter');
const landscape = PageSetup.oriented(letter, 'landscape');
const p = (text: string) => schema.nodes.paragraph!.create(null, schema.text(text));
const section = (setup: PageSetup | null) =>
  schema.nodes.section_break!.create({ start: 'next-page', setup });
const doc = schema.nodes.doc!.create(null, [
  p('a'),
  section(landscape),
  p('b'),
  section(null),
  p('c'),
]);

describe('bodySections', () => {
  it("reads each section's setup and each block's section, a break's line ending its section", () => {
    const { setups, sectionOf } = bodySections(doc, letter);
    // A break without a setup keeps the one before it.
    expect(setups).toEqual([letter, landscape, landscape]);
    expect(sectionOf).toEqual([0, 0, 1, 1, 2]);
  });

  it('reads the section a place is in', () => {
    expect(sectionAt(doc, 1)).toBe(0);
    const b = 3 + doc.child(1).nodeSize + 1;
    expect(sectionAt(doc, b)).toBe(1);
    expect(sectionAt(doc, doc.content.size - 1)).toBe(2);
  });
});

describe('sectionInset', () => {
  it("places a section's text area from the first's, both pages centred", () => {
    expect(sectionInset(letter, letter)).toBeNull();
    // Landscape Letter: 11 in across, 9 in of text, starting 1.25 in further left than the first's.
    expect(sectionInset(letter, landscape)).toEqual({ width: 9 * 96, shift: -1.25 * 96 });
    const wide = { ...letter, margins: { ...letter.margins, left: 36 } };
    expect(sectionInset(letter, wide)).toEqual({ width: 7 * 96, shift: -0.5 * 96 });
  });

  it('decorates the blocks of a section whose text area differs', () => {
    const set = sectionWidths(doc, letter);
    const decorated = set.find().map((d) => d.from);
    const b = 3 + doc.child(1).nodeSize;
    expect(decorated).toEqual([b, b + 3, b + 3 + doc.child(3).nodeSize]);
    expect(sectionWidths(schema.nodes.doc!.create(null, [p('a')]), letter)).toBe(
      sectionWidths(schema.nodes.doc!.create(null, [p('b')]), letter),
    );
  });

  it('draws the sections again when the first section changes', () => {
    let first = letter;
    const plugin = sectionWidthsPlugin(() => first);
    const state = EditorState.create({ doc, plugins: [plugin] });
    expect(plugin.getState(state)!.find()).toHaveLength(3);
    first = landscape;
    const after = state.apply(state.tr.setMeta(SECTIONS_CHANGED, true));
    // Now every section is landscape, the first one too: none differs.
    expect(plugin.getState(after)!.find()).toHaveLength(0);
    expect(plugin.getState(after.apply(after.tr))).toBe(plugin.getState(after));
  });
});

describe('sectionInset, with columns (page-layout.md "Columns")', () => {
  const two = { ...letter, columns: { count: 2, gap: 36 } };

  it("draws a section of columns at a column's width where pages are laid out, and as one column elsewhere", () => {
    // Letter's 6.5 in less a 0.5 in gap, in two: 3 in each, a column every 3.5 in.
    expect(sectionInset(letter, two, true)).toEqual({
      width: 3 * 96,
      shift: 0,
      columns: { textWidth: 6.5 * 96, step: 3.5 * 96, gap: 0.5 * 96 },
    });
    expect(sectionInset(letter, two, false)).toBeNull();
  });

  it('marks the blocks of a section of columns with their column step', () => {
    const columns = schema.nodes.doc!.create(null, [
      p('a'),
      schema.nodes.section_break!.create({ start: 'continuous', setup: two }),
      p('b'),
    ]);
    const [, decorated] = sectionWidths(columns, letter, true).find();
    expect(decorated).toBeUndefined();
    const set = sectionWidths(columns, two, true).find();
    expect(set).toHaveLength(3);
    const attrs = (set[0] as unknown as { type: { attrs: Record<string, string> } }).type.attrs;
    expect(attrs['data-section-columns']).toBe('');
    expect(attrs.style).toContain('--column-step: 336px');
  });
});
