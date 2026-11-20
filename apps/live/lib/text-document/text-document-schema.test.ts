// @vitest-environment jsdom
// docs/specs/034-text-documents/live-editing-and-storage.md "The layout": the editor's schema has a node or mark for
// every element and attribute of the live state, so binding the editor never drops what it cannot show.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import * as Y from 'yjs';
import {
  BODY_BLOCKS,
  KEPT_BLOCK,
  KEPT_BLOCK_ATTRIBUTES,
  KEPT_INLINE,
  KEPT_INLINE_ATTRIBUTES,
  PARAGRAPH_ATTRIBUTES,
  readTextDocumentFile,
  RUN_MARKS,
  SECTION_BREAK,
  SECTION_BREAK_ATTRIBUTES,
  TextDocumentState,
} from '@livedoc/text-documents';
import { textDocumentSchema } from './text-document-schema';

const CORPUS = join(import.meta.dirname, '../../../../packages/text-documents/corpus');

describe('textDocumentSchema', () => {
  it('has a node for every element of the layout, with every attribute', () => {
    const attributes: Record<string, readonly string[]> = {
      paragraph: PARAGRAPH_ATTRIBUTES,
      [SECTION_BREAK]: SECTION_BREAK_ATTRIBUTES,
      [KEPT_BLOCK]: KEPT_BLOCK_ATTRIBUTES,
      [KEPT_INLINE]: KEPT_INLINE_ATTRIBUTES,
    };
    for (const name of [...BODY_BLOCKS, KEPT_INLINE]) {
      const node = textDocumentSchema.nodes[name];
      expect(node, name).toBeDefined();
      expect(Object.keys(node!.spec.attrs ?? {}).sort()).toEqual([...attributes[name]!].sort());
    }
  });

  it('has a mark for every run attribute', () => {
    for (const mark of RUN_MARKS) expect(textDocumentSchema.marks[mark], mark).toBeDefined();
  });

  // standard-mapping.md "Shown as it reads".
  it('shows kept content as it reads: hidden, a line break or a named placeholder', () => {
    const render = (name: string) => {
      const node = textDocumentSchema.nodes.kept_inline!.create({ name, xml: { xml: '', ns: {} } });
      const spec = node.type.spec.toDOM!(node) as unknown as [
        string,
        Record<string, string>,
        string?,
      ];
      return { tag: spec[0], text: spec[2] ?? '' };
    };
    expect(render('bookmarkStart')).toEqual({ tag: 'span', text: '' });
    expect(render('br')).toEqual({ tag: 'br', text: '' });
    expect(render('footnoteReference')).toEqual({
      tag: 'span',
      text: 'footnoteReference, kept from the file',
    });
  });

  it.each([
    'libreoffice/features.odt',
    'libreoffice/rich.docx',
    'word/VariousPictures.docx',
    'word/bookmarks.docx',
  ])('binds the editor to %s without changing the state', async (file) => {
    const read = await readTextDocumentFile(new Uint8Array(readFileSync(join(CORPUS, file))));
    if (!read.ok) throw new Error(file);
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(read.document)]);
    const before = Y.encodeStateVector(doc);
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        schema: textDocumentSchema,
        plugins: [ySyncPlugin(TextDocumentState.body(doc))],
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The binding renders the state; it must write nothing back.
    expect(Y.encodeStateVector(doc)).toEqual(before);
    // Typing makes the binding write the editor's document back: a character typed and taken away changes nothing.
    let at = -1;
    view.state.doc.descendants((node, pos) => {
      if (at < 0 && node.type.name === 'paragraph') at = pos + 1;
      return at < 0;
    });
    view.dispatch(view.state.tr.insertText('!', at));
    view.dispatch(view.state.tr.delete(at, at + 1));
    expect(TextDocumentState.document(doc, read.document.format).body).toEqual(read.document.body);
    view.destroy();
  });
});

// text-and-paragraphs.md "Paragraph styles": a paragraph names its style for the document's style sheet.
describe('a paragraph drawn in its style', () => {
  it('names its style, and none for Normal text', () => {
    const toDom = (style: string | null): unknown =>
      textDocumentSchema.nodes.paragraph!.spec.toDOM!(
        textDocumentSchema.nodes.paragraph!.create({ style }),
      );
    expect(toDom('Heading_20_1')).toEqual(['p', { 'data-style': 'Heading_20_1' }, 0]);
    expect(toDom(null)).toEqual(['p', 0]);
  });

  // text-and-paragraphs.md "Alignment and indents": its own paragraph formatting over its style's.
  it('draws its own paragraph formatting over its style, and nothing unsafe', () => {
    const toDom = (props: unknown): unknown =>
      textDocumentSchema.nodes.paragraph!.spec.toDOM!(
        textDocumentSchema.nodes.paragraph!.create({ style: 'Title', props }),
      );
    expect(toDom({ align: 'center', indentStart: 36, indentFirst: -18, spaceAfter: 6 })).toEqual([
      'p',
      {
        'data-style': 'Title',
        style:
          'text-align: center; --text-document-indent-start: 36pt; text-indent: -18pt; margin-bottom: 6pt;',
      },
      0,
    ]);
    expect(toDom({ align: 'centre;color:red', indentStart: 'x' })).toEqual([
      'p',
      { 'data-style': 'Title' },
      0,
    ]);
    expect(toDom({})).toEqual(['p', { 'data-style': 'Title' }, 0]);
  });
});
