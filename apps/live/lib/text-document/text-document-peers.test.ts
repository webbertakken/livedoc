// @vitest-environment jsdom
// docs/specs/034-text-documents/live-editing-and-storage.md "Presence": a collaborator's caret travels as relative
// positions and is drawn by its character, whatever is typed before it.
import { describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import * as Y from 'yjs';
import { TextDocument, TextDocumentState } from '@livedoc/text-documents';
import { textDocumentSchema } from './text-document-schema';
import { selectionOf, setTextDocumentPeers, textDocumentPeersPlugin } from './text-document-peers';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function editorOn(doc: Y.Doc, publish = vi.fn()) {
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      schema: textDocumentSchema,
      plugins: [
        ySyncPlugin(TextDocumentState.body(doc)),
        textDocumentPeersPlugin({ canEdit: () => true, publish }),
      ],
    }),
  });
  await tick();
  return view;
}

function twoReplicas() {
  const a = TextDocumentState.load([
    TextDocumentState.fromDocument(TextDocument.fromTexts(['Hello world'])),
  ]);
  const b = new Y.Doc({ gc: false });
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  a.on('update', (u: Uint8Array, origin: unknown) => origin !== 'b' && Y.applyUpdate(b, u, 'a'));
  b.on('update', (u: Uint8Array, origin: unknown) => origin !== 'a' && Y.applyUpdate(a, u, 'b'));
  return { a, b };
}

describe('textDocumentPeersPlugin', () => {
  it("draws a collaborator's caret by its character, even after text is typed before it", async () => {
    const { a, b } = twoReplicas();
    const ana = await editorOn(a);
    const ben = await editorOn(b);
    // Ana's caret before "world" (paragraph opens at 0, text starts at 1).
    ana.dispatch(ana.state.tr.setSelection(TextSelection.create(ana.state.doc, 7)));
    const selection = selectionOf(ana.state)!;
    setTextDocumentPeers(ben, [
      { id: 'ana', name: 'Ana', color: '#1a73e8', ...selection, fresh: true },
    ]);
    const caret = () => ben.dom.querySelector<HTMLElement>('.text-document-peer-caret');
    expect(caret()?.dataset.name).toBe('Ana');
    expect(caret()?.previousSibling?.textContent).toBe('Hello ');

    // Ben types at the very start: Ana's caret stays before "world".
    ben.dispatch(ben.state.tr.insertText('Oh, ', 1));
    await tick();
    expect(ben.state.doc.textContent).toBe('Oh, Hello world');
    expect(caret()?.previousSibling?.textContent).toBe('Oh, Hello ');
  });

  it('tints a selection, and publishes ours only while the writing has focus', async () => {
    const { a, b } = twoReplicas();
    const publish = vi.fn();
    const ana = await editorOn(a, publish);
    const ben = await editorOn(b);
    ana.dispatch(ana.state.tr.setSelection(TextSelection.create(ana.state.doc, 1, 6)));
    expect(publish).toHaveBeenLastCalledWith(null);
    setTextDocumentPeers(ben, [
      { id: 'ana', name: 'Ana', color: '#1a73e8', ...selectionOf(ana.state)!, fresh: false },
    ]);
    expect(ben.dom.querySelector('.text-document-peer-selection')?.textContent).toBe('Hello');
    ana.destroy();
    expect(publish).toHaveBeenLastCalledWith(null);
  });
});
