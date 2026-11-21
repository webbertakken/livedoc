// Carets in the writing, on the page (docs/specs/034-text-documents/live-editing-and-storage.md "Presence"). Ours: the
// selection, while the writing has focus and may be edited, published as Yjs relative positions so it stays by its
// character whatever is typed before it. Collaborators': each one's caret in their colour, their selection tinted
// behind it, their name on it while it has just moved; set by a meta transaction (setTextDocumentPeers), which
// changes no text. A position that no longer resolves is not drawn.
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from 'y-prosemirror';
import * as Y from 'yjs';
import { afterNextPaint } from '@/lib/after-next-paint';
import { base64OfBytes, bytesOfBase64 } from '@livedoc/text-documents/base64';
import type { TextDocumentPeer, TextDocumentSelection } from './text-document-carets-store';

type Binding = {
  doc: Y.Doc;
  type: Y.XmlFragment;
  binding: { mapping: Map<Y.AbstractType<unknown>, unknown> } | null;
};

export const textDocumentPeersKey = new PluginKey<readonly TextDocumentPeer[]>(
  'text-document-peers',
);

function bindingOf(state: EditorState): Binding | null {
  const y = ySyncPluginKey.getState(state) as Binding | undefined;
  return y?.binding ? y : null;
}

function encode(pos: number, y: Binding): string {
  // y-prosemirror types its answer as any; it is a Yjs relative position.
  const relative = absolutePositionToRelativePosition(
    pos,
    y.type,
    y.binding!.mapping as never,
  ) as unknown as Y.RelativePosition;
  return base64OfBytes(Y.encodeRelativePosition(relative));
}

function resolve(position: string, y: Binding, size: number): number | null {
  const bytes = bytesOfBase64(position);
  if (!bytes) return null;
  try {
    const at = relativePositionToAbsolutePosition(
      y.doc,
      y.type,
      Y.decodeRelativePosition(bytes),
      y.binding!.mapping as never,
    );
    return at === null ? null : Math.min(at, size);
  } catch {
    return null;
  }
}

/** The selection as relative positions, or null before the binding has mapped the document. */
export function selectionOf(state: EditorState): TextDocumentSelection | null {
  const y = bindingOf(state);
  if (!y || y.binding!.mapping.size === 0) return null;
  return { anchor: encode(state.selection.anchor, y), head: encode(state.selection.head, y) };
}

function caretDom(peer: TextDocumentPeer): HTMLElement {
  const caret = document.createElement('span');
  caret.className = 'text-document-peer-caret';
  caret.style.setProperty('--text-document-peer', peer.color);
  caret.dataset.name = peer.name;
  caret.dataset.peer = peer.id;
  if (peer.fresh) caret.dataset.fresh = '';
  caret.setAttribute('aria-hidden', 'true');
  return caret;
}

function peerDecorations(state: EditorState, peers: readonly TextDocumentPeer[]): DecorationSet {
  const y = bindingOf(state);
  if (!y || peers.length === 0 || y.binding!.mapping.size === 0) return DecorationSet.empty;
  const size = Math.max(state.doc.content.size - 1, 0);
  const decorations: Decoration[] = [];
  for (const peer of peers) {
    const anchor = resolve(peer.anchor, y, size);
    const head = resolve(peer.head, y, size);
    if (anchor === null || head === null) continue;
    decorations.push(
      Decoration.widget(head, () => caretDom(peer), {
        key: `peer:${peer.id}:${peer.color}:${peer.name}:${peer.fresh ? 1 : 0}`,
        side: 10,
        marks: [],
        ignoreSelection: true,
      }),
    );
    if (anchor !== head)
      decorations.push(
        Decoration.inline(Math.min(anchor, head), Math.max(anchor, head), {
          class: 'text-document-peer-selection',
          style: `--text-document-peer: ${peer.color}`,
        }),
      );
  }
  return DecorationSet.create(state.doc, decorations);
}

/**
 * The carets plugin: draws `setTextDocumentPeers`' peers, and tells `publish` where this person's selection is while
 * the writing has focus and `canEdit()` holds, or null when it has not.
 */
export function textDocumentPeersPlugin(deps: {
  canEdit: () => boolean;
  publish: (selection: TextDocumentSelection | null) => void;
}): Plugin<readonly TextDocumentPeer[]> {
  const publishFrom = (view: EditorView) =>
    deps.publish(view.hasFocus() && deps.canEdit() ? selectionOf(view.state) : null);
  // Told after the frame that paints the change, once however many came in it (performance.md "A keystroke's
  // frame"): a relative position walks the live state up to the caret.
  let waiting: (() => void) | null = null;
  const publishSoon = (view: EditorView) => {
    waiting ??= afterNextPaint(() => {
      waiting = null;
      if (!view.isDestroyed) publishFrom(view);
    });
  };
  const cancel = () => {
    waiting?.();
    waiting = null;
  };
  return new Plugin<readonly TextDocumentPeer[]>({
    key: textDocumentPeersKey,
    state: {
      init: () => [],
      apply: (tr, peers) =>
        (tr.getMeta(textDocumentPeersKey) as readonly TextDocumentPeer[] | undefined) ?? peers,
    },
    props: {
      decorations: (state) => peerDecorations(state, textDocumentPeersKey.getState(state) ?? []),
      handleDOMEvents: {
        focus: (view) => {
          publishFrom(view);
          return false;
        },
        blur: () => {
          cancel();
          deps.publish(null);
          return false;
        },
      },
    },
    view: () => ({
      update: (view, previous) => {
        const edited = previous.doc !== view.state.doc;
        if (edited || !previous.selection.eq(view.state.selection)) publishSoon(view);
        // An edit reaches the live state after this state was drawn: place the carets again once it has.
        const peers = textDocumentPeersKey.getState(view.state) ?? [];
        if (edited && peers.length > 0)
          queueMicrotask(() => {
            if (!view.isDestroyed)
              setTextDocumentPeers(view, textDocumentPeersKey.getState(view.state) ?? []);
          });
      },
      destroy: () => {
        cancel();
        deps.publish(null);
      },
    }),
  });
}

/**
 * Bring a collaborator's caret into view (editing-surface.md "The title row", Presence): the page scrolls, nobody's
 * selection moves. False when their caret is not drawn here.
 */
export function scrollToTextDocumentPeer(view: EditorView, personId: string): boolean {
  const caret = [...view.dom.querySelectorAll<HTMLElement>('.text-document-peer-caret')].find(
    (el) => el.dataset.peer === personId,
  );
  if (!caret) return false;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
  caret.scrollIntoView({ block: 'center', inline: 'nearest', behavior: still ? 'auto' : 'smooth' });
  return true;
}

/** Draw these collaborators' carets: a meta transaction, which changes no text and reaches no history. */
export function setTextDocumentPeers(view: EditorView, peers: readonly TextDocumentPeer[]): void {
  view.dispatch(view.state.tr.setMeta(textDocumentPeersKey, peers).setMeta('addToHistory', false));
}
