// The formatting clipboard and the paint roller (docs/specs/034-text-documents/text-and-paragraphs.md "Paint format"):
// state of the editor, so the toolbar reads the roller as the caret's formatting is read. Copy text formatting fills
// the clipboard; Paste text formatting applies it; the roller copies, then paints the next selection the pointer
// makes (once) or every one (held) until it is pressed again or Escape is pressed in the writing.
import { Plugin, PluginKey, type Command, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { readDomSelection } from './text-document-dom-selection';
import { copyFormatting, pasteFormatting, type FormattingCopy } from './text-document-format-copy';

export type Roller = 'off' | 'once' | 'held';
export type PaintFormatState = { readonly copy: FormattingCopy | null; readonly roller: Roller };

const IDLE: PaintFormatState = { copy: null, roller: 'off' };

export const paintFormatKey = new PluginKey<PaintFormatState>('textDocumentPaintFormat');

/** The clipboard and the roller; idle in an editor without the plugin. */
export const paintFormatOf = (state: EditorState): PaintFormatState =>
  paintFormatKey.getState(state) ?? IDLE;

/** A step of the clipboard or the roller: never an edit, so never an undo step of its own. */
const step =
  (next: (state: EditorState) => PaintFormatState): Command =>
  (state, dispatch) => {
    const value = next(state);
    if (value.roller !== paintFormatOf(state).roller)
      debugLog('[text-document] paint format', { roller: value.roller });
    dispatch?.(state.tr.setMeta(paintFormatKey, value).setMeta('addToHistory', false));
    return true;
  };

/** Copy text formatting (⌘⌥C): the selection's formatting onto the clipboard. */
export const copyTextFormatting: Command = step((state) => ({
  ...paintFormatOf(state),
  copy: copyFormatting(state),
}));

/** Paste text formatting (⌘⌥V): the clipboard onto the selection; nothing when nothing is copied. */
export const pasteTextFormatting: Command = (state, dispatch) => {
  const { copy } = paintFormatOf(state);
  return copy ? pasteFormatting(copy)(state, dispatch) : false;
};

/** A press on the roller: off, it copies and turns on once; on, it turns off. */
export const pressRoller: Command = step((state) =>
  paintFormatOf(state).roller === 'off'
    ? { copy: copyFormatting(state), roller: 'once' }
    : { ...paintFormatOf(state), roller: 'off' },
);

/** A double press on the roller: held on, with what the first press copied (copied now when there is none). */
export const holdRoller: Command = step((state) => {
  const { copy } = paintFormatOf(state);
  return { copy: copy ?? copyFormatting(state), roller: 'held' };
});

const releaseRoller: Command = step((state) => ({ ...paintFormatOf(state), roller: 'off' }));

/** The roller paints the selection there is (pointer up): once lets go in the same transaction. */
const paintSelection: Command = (state, dispatch) => {
  const { copy, roller } = paintFormatOf(state);
  if (!copy || roller === 'off' || state.selection.empty) return false;
  return pasteFormatting(copy)(state, (tr) => {
    if (roller === 'once') {
      tr.setMeta(paintFormatKey, { copy, roller: 'off' });
      debugLog('[text-document] paint format', { roller: 'off' });
    }
    dispatch?.(tr);
  });
};

function paintAfterPointer(view: EditorView) {
  // The editor reads the selection the pointer made as it is let go; read it after that.
  setTimeout(() => {
    if (view.isDestroyed) return;
    readDomSelection(view);
    if (paintSelection(view.state, view.dispatch))
      track('Element', 'Changed', 'TextDocumentFormatPaint');
  }, 0);
}

export function paintFormatPlugin(): Plugin<PaintFormatState> {
  return new Plugin<PaintFormatState>({
    key: paintFormatKey,
    state: {
      init: () => IDLE,
      apply: (tr, value) => (tr.getMeta(paintFormatKey) as PaintFormatState | undefined) ?? value,
    },
    props: {
      // The pointer over the writing is a paint roller while it is on.
      attributes: (state): Record<string, string> =>
        paintFormatOf(state).roller === 'off' ? {} : { class: 'text-document-painting' },
      handleKeyDown: (view, event) => {
        if (event.key !== 'Escape' || paintFormatOf(view.state).roller === 'off') return false;
        return releaseRoller(view.state, view.dispatch);
      },
      handleDOMEvents: {
        // A selection made with the pointer is painted when the pointer is let go, wherever that is.
        mousedown: (view, event) => {
          if (event.button !== 0 || paintFormatOf(view.state).roller === 'off') return false;
          view.dom.ownerDocument.defaultView?.addEventListener(
            'mouseup',
            () => paintAfterPointer(view),
            {
              once: true,
            },
          );
          return false;
        },
      },
    },
  });
}
