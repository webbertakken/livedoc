// Opening a drawing from its picture (docs/specs/034-text-documents/objects.md "Opening it again", "The picture's
// bar"): a double-click on a drawing's picture opens its drawing tab, for anyone who sees the writing; Alt+F10 on a
// selected one goes to its bar's first button, as on a table of contents.
import { keymap } from 'prosemirror-keymap';
import { NodeSelection, Plugin } from 'prosemirror-state';
import { PICTURE_BAR_CLASS } from './text-document-picture-drawing-layer';
import { drawingOfPicture } from './text-document-drawing-pictures';

/** Opens a drawing: its tab, and where its picture is (its position in the writing). */
export type OpenDrawing = (drawingTabId: string, pos: number) => void;

export function drawingOpenPlugin(open: () => OpenDrawing | null): Plugin {
  return new Plugin({
    props: {
      handleDoubleClickOn: (_view, _pos, node, nodePos, _event, direct) => {
        const drawing = direct ? drawingOfPicture(node) : null;
        const opener = drawing ? open() : null;
        if (!drawing || !opener) return false;
        opener(drawing, nodePos);
        return true;
      },
    },
  });
}

/** Alt+F10 on a selected drawing's picture goes to its bar's first button, while one is drawn. */
export function drawingBarKeys(): Plugin {
  return keymap({
    'Alt-F10': (state, _dispatch, view) => {
      const { selection } = state;
      if (!view || !(selection instanceof NodeSelection) || !drawingOfPicture(selection.node))
        return false;
      const dom = view.nodeDOM(selection.from);
      const button =
        dom instanceof HTMLElement
          ? dom.querySelector<HTMLElement>(`.${PICTURE_BAR_CLASS} button`)
          : null;
      button?.focus();
      return button !== null;
    },
  });
}
