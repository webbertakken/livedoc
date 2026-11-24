// The host under a picture its bar is drawn into (docs/specs/034-text-documents/objects.md "In the editor", "The
// picture's bar"): placed under the picture's bounds, unturned, from its left edge. The bar is React's, portalled in by
// the surface for the selected picture; an empty host draws nothing.
import { keymap } from 'prosemirror-keymap';
import { NodeSelection, type Plugin } from 'prosemirror-state';
import { PICTURE } from '@livedoc/text-documents';

export const PICTURE_BAR_CLASS = 'text-document-picture-bar';

/** The picture's bounds in its own box: their top left and height, in points. */
export type PictureBarPlace = {
  readonly left: number;
  readonly top: number;
  readonly height: number;
};

export function pictureBarHost(dom: HTMLElement) {
  const host = document.createElement('span');
  host.className = PICTURE_BAR_CLASS;
  host.dataset.pictureBar = '';
  dom.append(host);
  return {
    place({ left, top, height }: PictureBarPlace) {
      host.style.left = `${left}pt`;
      host.style.top = `${top + height}pt`;
    },
    destroy: () => host.remove(),
  };
}

/** Alt+F10 on a selected picture goes to its bar's first button, while one is drawn, as on a table of contents. */
export function pictureBarKeys(): Plugin {
  return keymap({
    'Alt-F10': (state, _dispatch, view) => {
      const { selection } = state;
      if (!view || !(selection instanceof NodeSelection) || selection.node.type.name !== PICTURE)
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
