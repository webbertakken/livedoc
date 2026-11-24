// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "Table of contents": one block of the body, read only, its
// entries paragraphs; named for screen readers; a press selects it whole; Backspace after it takes it whole; read back
// from its drawing; copied to other programs as its entries.
import { describe, expect, it } from 'vitest';
import { DOMParser as PmDOMParser, DOMSerializer, type Node as PmNode } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { baseKeymap } from 'prosemirror-commands';
import { textDocumentSchema as schema } from './text-document-schema';
import { CONTENTS_CLASS } from './text-document-contents';

const p = (text: string) => schema.nodes.paragraph!.create({}, text ? schema.text(text) : null);
const contents = (look = 'dotted', levels = 3, ...entries: string[]) =>
  schema.nodes.table_of_contents!.create({ look, levels }, entries.map(p));

describe('the table of contents node', () => {
  it('is drawn as navigation named Table of contents, read only, its look and levels on it', () => {
    const dom = DOMSerializer.fromSchema(schema).serializeNode(contents('dotted', 3, 'Alpha\t1'), {
      document,
    }) as HTMLElement;
    expect(dom.tagName).toBe('NAV');
    expect(dom.className).toBe(CONTENTS_CLASS);
    expect(dom.getAttribute('aria-label')).toBe('Table of contents');
    expect(dom.getAttribute('contenteditable')).toBe('false');
    expect(dom.dataset.look).toBe('dotted');
    expect(dom.dataset.levels).toBe('3');
    expect(dom.querySelector('p')?.textContent).toBe('Alpha\t1');
  });

  it('is read back from its drawing', () => {
    const dom = DOMSerializer.fromSchema(schema).serializeFragment(
      schema.node('doc', null, [contents('links', 2, 'Alpha'), p('Body')]).content,
      { document },
    );
    const holder = document.createElement('div');
    holder.append(dom);
    const doc = PmDOMParser.fromSchema(schema).parse(holder);
    const block = doc.child(0);
    expect(block.type.name).toBe('table_of_contents');
    expect(block.attrs).toMatchObject({ look: 'links', levels: 2 });
    expect(block.textContent).toBe('Alpha');
  });

  it('is selected whole, and Backspace after it takes it whole', () => {
    const doc: PmNode = schema.node('doc', null, [contents('plain', 6, 'A', 'B'), p('Body')]);
    const selected = EditorState.create({ doc, selection: NodeSelection.create(doc, 0) });
    expect((selected.selection as NodeSelection).node.type.name).toBe('table_of_contents');
    const after = doc.child(0).nodeSize + 1;
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, after) });
    const backspace = () => baseKeymap.Backspace!(state, (tr) => (state = state.apply(tr)));
    expect(backspace()).toBe(true);
    const cut = state;
    expect(cut.doc.childCount).toBe(1);
    expect(cut.doc.textContent).toBe('Body');
  });
});
