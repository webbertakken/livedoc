// Cropping a picture (docs/specs/034-text-documents/objects.md "Working with a picture", Cropping): which picture is
// being cropped, begun by a double-click on it or Crop image (for whoever may edit), and marked on it by a node
// decoration its view reads; Enter, Escape or the selection moving off it end cropping.
import { NodeSelection, Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { PICTURE } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { selectedPicture } from './text-document-picture-edit';

/** The decoration's mark a picture's view reads as being cropped. */
export const CROPPING_SPEC = { cropping: true } as const;

type Meta = { cropping: number | null };
const croppingKey = new PluginKey<number | null>('text-document-picture-cropping');

/** Where the picture being cropped is, or null. */
export const croppingAt = (state: EditorState): number | null =>
  croppingKey.getState(state) ?? null;

/** Selects the picture at `pos` and begins cropping it; false where no picture is. */
export function beginCropping(view: EditorView, pos: number): boolean {
  const node = pos >= 0 && pos < view.state.doc.content.size ? view.state.doc.nodeAt(pos) : null;
  if (node?.type.name !== PICTURE) return false;
  const meta: Meta = { cropping: pos };
  view.dispatch(
    view.state.tr
      .setSelection(NodeSelection.create(view.state.doc, pos))
      .setMeta(croppingKey, meta),
  );
  debugLog('[text-document] picture cropping', { begun: true });
  return true;
}

function endCropping(view: EditorView): void {
  const meta: Meta = { cropping: null };
  view.dispatch(view.state.tr.setMeta(croppingKey, meta));
  debugLog('[text-document] picture cropping', { begun: false });
}

export function pictureCroppingPlugin({ can }: { can: () => boolean }): Plugin<number | null> {
  return new Plugin<number | null>({
    key: croppingKey,
    state: {
      init: () => null,
      apply: (tr, was, _before, state) => {
        const meta = tr.getMeta(croppingKey) as Meta | undefined;
        let pos = meta ? meta.cropping : was;
        if (!meta && pos !== null) {
          const mapped = tr.mapping.mapResult(pos, 1);
          pos = mapped.deleted ? null : mapped.pos;
        }
        // Cropping lasts as long as the picture stays selected.
        return pos !== null && selectedPicture(state)?.pos === pos ? pos : null;
      },
    },
    props: {
      decorations: (state) => {
        const pos = croppingAt(state);
        const node = pos === null ? null : state.doc.nodeAt(pos);
        return pos === null || !node
          ? null
          : DecorationSet.create(state.doc, [
              Decoration.node(pos, pos + node.nodeSize, {}, CROPPING_SPEC),
            ]);
      },
      handleKeyDown: (view, event) => {
        if (croppingAt(view.state) === null || (event.key !== 'Enter' && event.key !== 'Escape'))
          return false;
        endCropping(view);
        return true;
      },
      handleDoubleClickOn: (view, _pos, node, nodePos, _event, direct) =>
        direct && node.type.name === PICTURE && can() && beginCropping(view, nodePos),
    },
  });
}
