// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Text formatting": a character's formatting is read through the
// live state's styles and defaults.
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { TextDocument, TextDocumentState } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { textFormattingReader } from './useTextDocumentFormatting';

describe('textFormattingReader', () => {
  const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(null, schema.text('a'))]);

  it('reads a new document’s styles while there is no live state', () => {
    const read = textFormattingReader(null, { current: null }, 'ooxml');
    expect(read()).toEqual({
      styles: TextDocument.blank({ format: 'ooxml' }).styles,
      defaults: TextDocument.blank({ format: 'ooxml' }).defaults,
    });
  });

  it('reads the live state once per editor state', () => {
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc }),
    });
    const blank = TextDocument.blank({ format: 'odf' });
    const defaults = { ...blank.defaults, text: { font: 'Georgia', size: 12 } };
    const live = {
      current: TextDocumentState.load([TextDocumentState.fromDocument({ ...blank, defaults })]),
    };
    const read = textFormattingReader(view, live, 'odf');
    const first = read();
    expect(first.defaults).toEqual(defaults);
    expect(read()).toBe(first);
    view.dispatch(view.state.tr.insertText('b'));
    expect(read()).not.toBe(first);
    view.destroy();
  });
});
