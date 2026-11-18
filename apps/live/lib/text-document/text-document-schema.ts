// The text document's ProseMirror schema (docs/specs/034-text-documents/text-and-paragraphs.md): the nodes the live
// state holds, named as y-prosemirror stores them (`paragraph` elements holding text), so the editor and every other
// reader of the state (TextDocumentState) agree.
import { Schema } from 'prosemirror-model';

export const textDocumentSchema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: {
      content: 'text*',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: {},
  },
});
