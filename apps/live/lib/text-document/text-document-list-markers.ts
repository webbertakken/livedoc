// List items drawn (docs/specs/034-text-documents/lists.md "Levels", "Checklists"): each item at its level's indent, its
// marker in the hanging space before its first line, a checklist item's box a checkbox that ticks it. The marker is no
// text of the writing: it cannot be selected, copied or typed into. Worked out again when the writing or the lists
// change.
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { ListMarkers, type ListMarker, type ParagraphProps } from '@livedoc/text-documents';
import { placeOf, toggleItemAt, type Lists } from './text-document-lists';
import { INDENT_START } from './text-document-style-sheet';
import { paperInk } from './text-document-paper';
import { editedTextblocks } from './text-document-text-edits';

export const listMarkersKey = new PluginKey<DecorationSet>('textDocumentListMarkers');
const key = listMarkersKey;
const REFRESH = 'refresh';
/** A ticked item's ink (default: Google's grey). */
export const TICKED_INK = '#5f6368';

const NAME_MAX = 80;

// The marker's box ticks the item it is drawn in, wherever edits have moved it since.
function markerDom(
  marker: ListMarker,
  hanging: number,
  item: PmNode,
  onTick: (pos: number) => void,
) {
  return (view: EditorView, getPos: () => number | undefined): HTMLElement => {
    const document = view.dom.ownerDocument;
    const span = document.createElement('span');
    span.className = 'text-document-list-marker';
    span.setAttribute('contenteditable', 'false');
    span.style.minWidth = `${hanging}pt`;
    if (marker.kind === 'check') {
      const box = document.createElement('span');
      box.setAttribute('role', 'checkbox');
      box.setAttribute('aria-checked', String(marker.checked));
      box.setAttribute('aria-label', item.textContent.slice(0, NAME_MAX) || 'Checklist item');
      box.className = 'text-document-list-check';
      if (view.editable) {
        box.tabIndex = -1;
        box.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const at = getPos();
          if (at !== undefined) onTick(at - 1);
        });
      } else box.setAttribute('aria-disabled', 'true');
      span.append(box);
    } else if (marker.kind === 'bullet') {
      span.setAttribute('role', 'img');
      span.setAttribute('aria-label', 'bullet');
      span.textContent = marker.text;
    } else span.textContent = marker.text;
    return span;
  };
}

/** The decorations that draw every list item. */
export function listDecorations(
  doc: PmNode,
  lists: Lists,
  tick: (pos: number) => void,
): DecorationSet {
  const items: { node: PmNode; pos: number }[] = [];
  doc.forEach((node, pos) => {
    if (node.type.name === 'paragraph') items.push({ node, pos });
  });
  const markers = ListMarkers.of(
    items.map(({ node }) => placeOf(node) ?? undefined),
    lists,
  );
  const decorations: Decoration[] = [];
  items.forEach(({ node, pos }, i) => {
    const marker = markers[i];
    const place = placeOf(node);
    if (!place) return;
    const def = lists[place.id]?.levels[marker?.level ?? place.level];
    const indent = def?.indent ?? 36 * (place.level + 1);
    const hanging = def?.hanging ?? 18;
    const own = (node.attrs as { props: ParagraphProps | null }).props ?? {};
    // The level's indents, unless the paragraph has its own.
    const style = [
      own.indentStart === undefined ? `${INDENT_START}: ${indent}pt` : '',
      own.indentFirst === undefined ? `text-indent: ${-hanging}pt` : '',
      marker?.kind === 'check' &&
      marker.checked &&
      !(def?.kind === 'check' && def.strikeChecked === false)
        ? `color: ${paperInk(TICKED_INK)}; text-decoration-line: line-through`
        : '',
    ]
      .filter(Boolean)
      .join('; ');
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        style,
        'data-list-kind': marker?.kind ?? 'unnumbered',
        'data-list-level': String(place.level),
      }),
    );
    if (marker)
      decorations.push(
        Decoration.widget(pos + 1, markerDom(marker, hanging, node, tick), {
          side: -1,
          ignoreSelection: true,
          key: `${marker.kind}:${marker.text}:${marker.kind === 'check' && marker.checked}:${hanging}:${node.textContent.slice(0, NAME_MAX)}`,
        }),
      );
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Draws the list items. `subscribe` tells of a change to the lists themselves (a definition added or changed), which no
 * transaction of the writing carries.
 */
export function listMarkersPlugin(
  readLists: () => Lists,
  subscribe: (listener: () => void) => () => void,
): Plugin<DecorationSet> {
  let view: EditorView | null = null;
  const tick = (pos: number) => {
    if (view && !view.isDestroyed) toggleItemAt(pos)(view.state, view.dispatch);
  };
  const build = (state: EditorState) => listDecorations(state.doc, readLists(), tick);
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => build(state),
      apply: (tr, set, _old, state) => {
        if (tr.getMeta(key) === REFRESH) return build(state);
        if (!tr.docChanged) return set;
        // An edit of text outside the items keeps them drawn (performance.md "A keystroke's frame"); one inside an item
        // may rename its box.
        const edited = editedTextblocks(tr);
        if (edited && !edited.some((node) => placeOf(node))) return set.map(tr.mapping, tr.doc);
        return build(state);
      },
    },
    props: { decorations: (state) => key.getState(state) },
    view: (editor) => {
      view = editor;
      const stop = subscribe(() => {
        if (!editor.isDestroyed)
          editor.dispatch(editor.state.tr.setMeta(key, REFRESH).setMeta('addToHistory', false));
      });
      return {
        destroy: () => {
          stop();
          view = null;
        },
      };
    },
  });
}
