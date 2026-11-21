import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { textDocumentSchema as schema } from './text-document-schema';
import { changesTextOnly, editedTextblocks } from './text-document-text-edits';

// performance.md "A keystroke's frame": what draws from the blocks alone keeps its drawing through an edit of text.
const p = (text: string) => schema.nodes.paragraph!.create(null, text ? schema.text(text) : null);
const state = () => EditorState.create({ doc: schema.node('doc', null, [p('abc'), p('def')]) });
const bold = schema.marks.bold!.create({ value: true });

describe('changesTextOnly', () => {
  it('holds for typing, deleting and formatting inside one paragraph', () => {
    expect(changesTextOnly(state().tr.insertText('x', 2))).toBe(true);
    expect(changesTextOnly(state().tr.delete(1, 3))).toBe(true);
    expect(changesTextOnly(state().tr.addMark(1, 3, bold))).toBe(true);
    expect(changesTextOnly(state().tr.insertText('x', 2).insertText('y', 7))).toBe(true);
  });

  it('fails for a new paragraph, two joined, one restyled or one replaced', () => {
    expect(changesTextOnly(state().tr.split(2))).toBe(false);
    expect(changesTextOnly(state().tr.delete(3, 7))).toBe(false);
    expect(changesTextOnly(state().tr.setNodeMarkup(0, undefined, { style: 'Heading_20_1' }))).toBe(
      false,
    );
    expect(changesTextOnly(state().tr.replaceWith(0, 5, p('new')))).toBe(false);
    expect(changesTextOnly(state().tr.insert(0, p('first')))).toBe(false);
  });

  it('fails for no change at all, which leaves nothing to keep', () => {
    expect(changesTextOnly(state().tr)).toBe(false);
  });
});

describe('editedTextblocks', () => {
  it('names each paragraph an edit of text changed, as it was', () => {
    const edited = editedTextblocks(state().tr.insertText('x', 2).insertText('y', 7));
    expect(edited?.map((node) => node.textContent)).toEqual(['abc', 'def']);
  });

  it('is null for more than an edit of text', () => {
    expect(editedTextblocks(state().tr.split(2))).toBeNull();
    expect(editedTextblocks(state().tr)).toBeNull();
  });
});
