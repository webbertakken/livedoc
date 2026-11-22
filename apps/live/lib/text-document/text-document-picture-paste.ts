// Pictures pasted or dropped as files (docs/specs/034-text-documents/objects.md "Inserting"): the picture files of a
// paste are placed at the caret, those of a drop at the drop point, before the clipboard's own paste reads the rest.
// Whether they are taken is the caller's (an Editor's writing takes them; a reader's never).
import { Plugin, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

/** The picture files a transfer carries: every file whose type names a picture. */
export function pictureFilesOf(data: DataTransfer | null): File[] {
  return [...(data?.files ?? [])].filter((file) => file.type.startsWith('image/'));
}

/** Takes the files at the caret; true when they were taken, so nothing else handles the event. */
export type TakePictureFiles = (files: File[], source: 'Paste' | 'Drop') => boolean;

export function picturePastePlugin(take: TakePictureFiles): Plugin {
  return new Plugin({
    props: {
      handlePaste: (_view, event) => {
        const files = pictureFilesOf(event.clipboardData);
        return files.length > 0 && take(files, 'Paste');
      },
      handleDrop: (view: EditorView, event, _slice, moved) => {
        if (moved) return false;
        const files = pictureFilesOf(event.dataTransfer);
        if (files.length === 0) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!at) return false;
        if (!take(files, 'Drop')) return false;
        // The drop point is the caret the pictures are placed at once stored, as a paste places them at the caret.
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at.pos)));
        event.preventDefault();
        return true;
      },
    },
  });
}
