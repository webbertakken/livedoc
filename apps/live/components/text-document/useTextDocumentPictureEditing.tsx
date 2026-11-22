'use client';

// Working with a selected picture (docs/specs/034-text-documents/objects.md "Working with a picture"): Format > Image's
// Alt text and Replace image, and the context menu's, each dimmed while no picture is selected; Alt text's dialog; a
// replacement placed in the picture's place. An Editor's alone.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  replacePictureMedia,
  selectedPicture,
  setPictureAlt,
} from '@/lib/text-document/text-document-picture-edit';
import { startUndoStep } from '@/lib/text-document/text-document-undo';
import { TextDocumentAltTextDialog } from './TextDocumentAltTextDialog';
import type { Bringing } from './useTextDocumentPictures';
import type { ImagePickerTab } from '@/components/panels/ImagePicker';

type Selected = { pos: number; alt: string; decorative: boolean };

const sameSelected = (a: Selected | null, b: Selected | null) =>
  a === b ||
  (a !== null && b !== null && a.pos === b.pos && a.alt === b.alt && a.decorative === b.decorative);

export function useTextDocumentPictureEditing({
  view,
  canEdit,
  subscribe,
  bring,
}: {
  view: EditorView | null;
  canEdit: boolean;
  // Told when the caret moves or the writing changes.
  subscribe: (listener: () => void) => () => void;
  // How a replacement is brought: the inserting hook's file chooser and picker.
  bring: {
    chooseFile: (bringing: Bringing) => void;
    openPicker: (tab: ImagePickerTab, bringing: Bringing) => void;
  };
}) {
  const read = useCallback((): Selected | null => {
    const found = view && !view.isDestroyed ? selectedPicture(view.state) : null;
    if (!found) return null;
    const { alt, decorative } = found.node.attrs;
    return {
      pos: found.pos,
      alt: typeof alt === 'string' ? alt : '',
      decorative: decorative === true,
    };
  }, [view]);
  const [selected, setSelected] = useState(read);
  useEffect(() => {
    const update = () => {
      const now = read();
      setSelected((was) => (sameSelected(was, now) ? was : now));
    };
    update();
    return subscribe(update);
  }, [read, subscribe]);

  // The Alt text dialog, opened anew each time so it starts from the picture's text.
  const [altOpen, setAltOpen] = useState<{ nonce: number; at: Selected } | null>(null);

  const applyAlt = useCallback(
    (change: { alt: string; decorative: boolean }) => {
      const at = altOpen?.at;
      setAltOpen(null);
      if (!at || !view || view.isDestroyed || !canEdit) return;
      startUndoStep(view);
      const done = setPictureAlt(at.pos, change)(view.state, view.dispatch);
      startUndoStep(view);
      debugLog('[text-document] picture alt text', { done, decorative: change.decorative });
      if (done) track('Element', 'Changed', 'TextDocumentImageAltText');
      view.focus();
    },
    [altOpen, view, canEdit],
  );

  // A replacement goes where the picture is when it lands (the selected one, else the one it was chosen for).
  const replacing = useCallback(
    (pos: number): Bringing => ({
      most: 1,
      put:
        ({ key, pixels }) =>
        (state, dispatch) => {
          const at = selectedPicture(state)?.pos ?? pos;
          return replacePictureMedia(at, { key, pixels })(state, dispatch);
        },
      placed: () => track('Element', 'Changed', 'TextDocumentImageReplace'),
    }),
    [],
  );

  const actions = useMemo((): OfficeActions => {
    if (!canEdit || !view) return {};
    const disabled = selected === null;
    const pos = selected?.pos ?? -1;
    return {
      'image-alt-text': {
        run: () => selected && setAltOpen({ nonce: Date.now(), at: selected }),
        disabled,
      },
      'image-replace-upload': { run: () => bring.chooseFile(replacing(pos)), disabled },
      'image-replace-search': {
        run: () => bring.openPicker('search', replacing(pos)),
        disabled,
      },
      'image-replace-gallery': {
        run: () => bring.openPicker('gallery', replacing(pos)),
        disabled,
      },
    };
  }, [canEdit, view, selected, bring, replacing]);

  const dialog = altOpen ? (
    <TextDocumentAltTextDialog
      key={altOpen.nonce}
      open
      alt={altOpen.at.alt}
      decorative={altOpen.at.decorative}
      onApply={applyAlt}
      onClose={() => {
        setAltOpen(null);
        view?.focus();
      }}
    />
  ) : null;

  return { actions, dialog };
}
