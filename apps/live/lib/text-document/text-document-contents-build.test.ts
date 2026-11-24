// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "Table of contents": its headings are the outline's within its
// levels (empty ones left out), each gaining an id; an entry is its heading's text, a tab and its page number (none
// with blue links, none pageless, the one it had on a screen that draws no pages), linking to `#<id>` in its level's
// Contents style; Insert puts one in at the caret in the body, splitting the paragraph, selected; Update rebuilds it.
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import type { Style } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { headingIdOf } from './text-document-heading-links';
import {
  CONTENTS_LOOK_ITEMS,
  contentsHeadings,
  insertContents,
  rebuildContents,
  type ContentsBuild,
} from './text-document-contents-build';

const mark = (name: string) => schema.nodes.bookmark!.create({ name });
const para = (level: number | null, ...parts: (string | PmNode)[]) =>
  schema.nodes.paragraph!.create(
    level === null ? {} : { props: { outlineLevel: level } },
    parts.map((part) => (typeof part === 'string' ? schema.text(part) : part)),
  );
const doc = (...blocks: PmNode[]) => schema.node('doc', null, blocks);
const styles: readonly Style[] = [];
const contents = (look: string, levels: number, ...entries: PmNode[]) =>
  schema.nodes.table_of_contents!.create({ look, levels }, entries.length ? entries : [para(null)]);

// Pages: each block on the page of its index + 1; Contents N styles named `C<N>`.
const build = (pages: ContentsBuild['pages'] = { kind: 'laid', pageOfBlock: (b) => b + 1 }) =>
  ({ styles, pages, textWidth: 468, styleOf: (level) => `C${level}` }) satisfies ContentsBuild;

type Entry = { text: string; style: unknown; href: unknown; stops: unknown };
const entriesOf = (block: PmNode | null | undefined): Entry[] => {
  const out: Entry[] = [];
  block?.forEach((entry) => {
    const attrs = entry.attrs as { style: unknown; props: { tabStops?: unknown } | null };
    out.push({
      text: entry.textContent,
      style: attrs.style,
      href: entry.firstChild?.marks.find((m) => m.type.name === 'link')?.attrs.href,
      stops: attrs.props?.tabStops,
    });
  });
  return out;
};
const dotted = [{ position: 468, align: 'end', leader: 'dot' }];
const plain = [{ position: 468, align: 'end' }];

describe('the looks Insert offers', () => {
  it('maps each Insert item to its look', () => {
    expect(CONTENTS_LOOK_ITEMS).toEqual({
      'toc-plain': 'plain',
      'toc-dotted': 'dotted',
      'toc-links': 'links',
    });
  });
});

describe('contentsHeadings', () => {
  it('lists the outline’s headings within its levels, in order, empty ones left out', () => {
    const d = doc(
      para(1, mark('_a'), 'One'),
      para(null, 'Body'),
      para(2, 'Two'),
      para(3, 'Three'),
      para(1, '  '),
    );
    expect(contentsHeadings(d, styles, 2)).toEqual([
      { pos: 0, block: 0, level: 1, text: 'One', id: '_a' },
      { pos: 12, block: 2, level: 2, text: 'Two', id: null },
    ]);
  });
});

describe('insertContents', () => {
  const twoHeadings = () => doc(para(null, 'Intro'), para(1, 'One'), para(2, 'Two'));

  it('splits the caret’s paragraph, builds its entries with ids and pages, and is selected', () => {
    let state = EditorState.create({
      doc: twoHeadings(),
      selection: TextSelection.create(twoHeadings(), 3),
    });
    expect(insertContents('dotted', build())(state, (tr) => (state = state.apply(tr)))).toBe(true);
    const d = state.doc;
    expect(d.childCount).toBe(5);
    expect([d.child(0).textContent, d.child(2).textContent]).toEqual(['In', 'tro']);
    const block = d.child(1);
    expect(block.attrs).toMatchObject({ look: 'dotted', levels: 6 });
    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect(state.selection.from).toBe(d.child(0).nodeSize);
    const one = headingIdOf(d.child(3))!;
    const two = headingIdOf(d.child(4))!;
    expect(one).toMatch(/^_/);
    expect(two).not.toBe(one);
    // The pages as drawn before it went in: the headings were blocks 1 and 2.
    expect(entriesOf(block)).toEqual([
      { text: 'One\t2', style: 'C1', href: `#${one}`, stops: dotted },
      { text: 'Two\t3', style: 'C2', href: `#${two}`, stops: dotted },
    ]);
  });

  it('goes before a paragraph whose start holds the caret, after one whose end does', () => {
    const at = (pos: number) => {
      let state = EditorState.create({
        doc: twoHeadings(),
        selection: TextSelection.create(twoHeadings(), pos),
      });
      insertContents('links', build())(state, (tr) => (state = state.apply(tr)));
      return state.doc;
    };
    expect(at(1).child(0).type.name).toBe('table_of_contents');
    const after = at(6);
    expect(after.childCount).toBe(4);
    expect(after.child(1).type.name).toBe('table_of_contents');
  });

  it('writes no page numbers With blue links, nor pageless', () => {
    for (const [look, pages] of [
      ['links', undefined],
      ['plain', { kind: 'pageless' }],
    ] as const) {
      let state = EditorState.create({ doc: twoHeadings() });
      insertContents(look, build(pages))(state, (tr) => (state = state.apply(tr)));
      const block = state.doc.child(0);
      expect(entriesOf(block).map((e) => [e.text, e.stops])).toEqual([
        ['One', undefined],
        ['Two', undefined],
      ]);
    }
  });

  it('is refused in a table and over a selected block', () => {
    const cell = schema.nodes.table_cell!.create(null, para(null, 'x'));
    const table = schema.nodes.table!.create(null, schema.nodes.table_row!.create(null, cell));
    const inTable = doc(table, para(1, 'One'));
    const state = EditorState.create({
      doc: inTable,
      selection: TextSelection.create(inTable, 4),
    });
    expect(insertContents('plain', build())(state)).toBe(false);
    const selected = EditorState.create({
      doc: inTable,
      selection: NodeSelection.create(inTable, 0),
    });
    expect(insertContents('plain', build())(selected)).toBe(false);
  });
});

describe('rebuildContents', () => {
  it('rebuilds the entries from the headings and pages as they are now', () => {
    const d = doc(contents('plain', 1), para(1, mark('_a'), 'One'), para(2, 'Deep'));
    let state = EditorState.create({ doc: d, selection: NodeSelection.create(d, 0) });
    expect(rebuildContents(0, build())(state, (tr) => (state = state.apply(tr)))).toBe(true);
    expect(entriesOf(state.doc.child(0))).toEqual([
      { text: 'One\t2', style: 'C1', href: '#_a', stops: plain },
    ]);
    // Still selected; the level 2 heading gained no id.
    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect(headingIdOf(state.doc.child(2))).toBeNull();
  });

  it('changes nothing when nothing moved', () => {
    const d = doc(contents('plain', 1), para(1, mark('_a'), 'One'));
    let state = EditorState.create({ doc: d });
    rebuildContents(0, build())(state, (tr) => (state = state.apply(tr)));
    const before = state.doc;
    let dispatched = false;
    expect(rebuildContents(0, build())(state, () => (dispatched = true))).toBe(true);
    expect(dispatched).toBe(false);
    expect(state.doc).toBe(before);
  });

  it('keeps an entry’s page number where this screen draws no pages; a new entry has none', () => {
    const old = para(null, schema.text('Old\t7', [schema.marks.link!.create({ href: '#_a' })]));
    const d = doc(contents('dotted', 6, old), para(1, mark('_a'), 'One'), para(1, 'New'));
    let state = EditorState.create({ doc: d });
    rebuildContents(0, build({ kind: 'unseen' }))(state, (tr) => (state = state.apply(tr)));
    expect(entriesOf(state.doc.child(0)).map((e) => [e.text, e.stops])).toEqual([
      ['One\t7', dotted],
      ['New', undefined],
    ]);
  });

  it('is refused where no table of contents starts', () => {
    const d = doc(para(1, 'One'));
    expect(rebuildContents(0, build())(EditorState.create({ doc: d }))).toBe(false);
  });
});
