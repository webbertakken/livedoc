// @vitest-environment jsdom
// docs/specs/034-text-documents/performance.md "A keystroke's frame": a local edit works out no selection in the live
// state (y-prosemirror, as patched in patches/), and a peer's edit still keeps the caret on the text it was beside.
// live-editing-and-storage.md "The binding": a change from the live state that takes away the object a person has
// selected leaves them a caret where it was, never an error (the patch restores a node selection only where a
// selectable node still stands).
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin, ySyncPluginKey } from 'y-prosemirror';
import { TextDocumentState } from '@livedoc/text-documents';
import { textDocumentSchema } from './text-document-schema';

const REMOTE = 'remote';

describe('the writing bound to its live state', () => {
  it('works out no selection for a local edit, and keeps the caret through a peer writing before it', async () => {
    const here = TextDocumentState.load();
    const peer = new Y.Doc();
    here.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE) Y.applyUpdate(peer, update, REMOTE);
    });
    peer.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE) Y.applyUpdate(here, update, REMOTE);
    });
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(here), REMOTE);
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        schema: textDocumentSchema,
        plugins: [ySyncPlugin(TextDocumentState.body(here))],
      }),
    });
    // The binding takes the editor over once its first render has run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const { binding } = ySyncPluginKey.getState(view.state) as {
      binding: { beforeTransactionSelection: unknown };
    };
    const seen: unknown[] = [];
    here.on('afterTransaction', (transaction: Y.Transaction) => {
      if (transaction.local) seen.push(binding.beforeTransactionSelection);
    });

    view.dispatch(view.state.tr.insertText('Hello', 1));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6)));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((selection) => selection === null)).toBe(true);

    const first = peerBody(peer, here).get(0) as Y.XmlElement;
    (first.get(0) as Y.XmlText).insert(0, 'Oh, ');
    expect(view.state.doc.textContent).toBe('Oh, Hello');
    expect(view.state.selection.from).toBe(10);
    view.destroy();
  });
});

// The peer's copy of the body: the same named fragment the live state keeps it in.
function peerBody(peer: Y.Doc, here: Y.Doc): Y.XmlFragment {
  const body = TextDocumentState.body(here);
  for (const [name, type] of here.share)
    if ((type as unknown) === body) return peer.getXmlFragment(name);
  throw new Error('no body');
}

/** A view bound to a fresh live state, with "ab" and a picture at `at` (2: between the letters; 3: at the end). */
async function boundWithPicture(at: number) {
  const doc = TextDocumentState.load();
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      schema: textDocumentSchema,
      plugins: [ySyncPlugin(TextDocumentState.body(doc))],
    }),
  });
  // The binding takes the editor over once its first render has run.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const picture = textDocumentSchema.nodes.picture!.create({ media: 'm1', width: 10, height: 10 });
  view.dispatch(view.state.tr.insertText('ab', 1).insert(at, picture));
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
  expect(view.state.selection).toBeInstanceOf(NodeSelection);
  return { doc, view };
}

/** The live state's first paragraph's picture taken away, as another person's change. */
function takePictureAway(doc: Y.Doc) {
  const paragraph = TextDocumentState.body(doc).get(0) as Y.XmlElement;
  const index = paragraph.toArray().findIndex((n) => n instanceof Y.XmlElement);
  doc.transact(() => paragraph.delete(index, 1), 'elsewhere');
}

describe('a selected object taken away by the live state', () => {
  for (const [where, at] of [
    ['between letters', 2],
    ['at the paragraph’s end', 3],
  ] as const)
    it(`leaves a caret where it was, ${where}`, async () => {
      const { doc, view } = await boundWithPicture(at);
      expect(() => takePictureAway(doc)).not.toThrow();
      expect(view.state.doc.textContent).toBe('ab');
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.from).toBe(at);
      view.destroy();
    });
});
