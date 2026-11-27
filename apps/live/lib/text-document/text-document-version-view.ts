// A version drawn (docs/specs/034-text-documents/review.md "Version history"): one document tab's writing as it stood
// at a version, read only, and what the version changed since the one before it in each editor's colour. It binds to a
// copy of the room's state that nothing sends, so whatever y-prosemirror's drawing does can never reach the room.
import { EditorState } from 'prosemirror-state';
import { EditorView, type NodeViewConstructor } from 'prosemirror-view';
import { ySyncPlugin, ySyncPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { TextDocumentState } from '@livedoc/text-documents';
import { textDocumentVersionSchema } from './text-document-ychange';
import type { VersionAuthorship } from './text-document-version-authorship';

/** What is drawn: the version, the one before it, and who wrote what. */
export type VersionDrawing = {
  readonly snapshot: Y.Snapshot;
  readonly previous: Y.Snapshot;
  readonly authorship: VersionAuthorship;
  /** Show changes: off draws the version alone, nothing added or removed. */
  readonly showChanges: boolean;
};

export type VersionView = {
  readonly view: EditorView;
  readonly doc: Y.Doc;
  /** Draws a version, or the same with changes shown or not. */
  readonly show: (drawing: VersionDrawing) => void;
  readonly destroy: () => void;
};

/** Whether a document tab held anything at a version (one made since holds nothing then). */
export function tabHeldAt(doc: Y.Doc, tab: string, snapshot: Y.Snapshot): boolean {
  const body = TextDocumentState.tabBody(doc, tab);
  return Y.typeListToArraySnapshot(body, snapshot).length > 0;
}

/** The current state as a version: a snapshot of the copy. */
export const snapshotOfState = (doc: Y.Doc): Y.Snapshot => Y.snapshot(doc);

export function openVersionView(
  mount: HTMLElement,
  {
    state,
    tab,
    nodeViews,
    attributes,
  }: {
    state: Uint8Array;
    tab: string;
    nodeViews: (doc: Y.Doc) => Record<string, NodeViewConstructor>;
    attributes: (doc: Y.Doc) => Record<string, string>;
  },
): VersionView {
  const doc = TextDocumentState.load([state]);
  const view = new EditorView(mount, {
    state: EditorState.create({
      schema: textDocumentVersionSchema,
      // y-prosemirror types its plugin as any.
      plugins: [ySyncPlugin(TextDocumentState.tabBody(doc, tab))],
    }),
    editable: () => false,
    nodeViews: nodeViews(doc),
    attributes: () => ({ ...attributes(doc), 'aria-readonly': 'true' }),
  });
  return {
    view,
    doc,
    show: ({ snapshot, previous, authorship, showChanges }) => {
      if (view.isDestroyed) return;
      view.dispatch(
        view.state.tr.setMeta(ySyncPluginKey, {
          snapshot,
          prevSnapshot: showChanges ? previous : snapshot,
          permanentUserData: authorship.permanentUserData,
          colorMapping: authorship.colorMapping,
          colors: authorship.colors,
        }),
      );
    },
    destroy: () => {
      view.destroy();
      doc.destroy();
    },
  };
}
