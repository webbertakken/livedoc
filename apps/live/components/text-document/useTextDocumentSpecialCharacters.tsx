'use client';

// Insert > Symbols > Special characters (docs/specs/034-text-documents/objects.md "Special characters"): the dialog,
// open while the session writes, each press put in at the caret of the writing the caret is in (the body, a header,
// a footer or a note); closing it gives the writing back its focus.
import { useCallback, useMemo, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import { OfficeSpecialCharactersDialog } from '@/components/office/OfficeSpecialCharactersDialog';
import {
  insertSpecialCharacter,
  specialCharacterActions,
} from '@/lib/text-document/text-document-special-characters';

export function useTextDocumentSpecialCharacters(view: EditorView | null, canEdit: boolean) {
  const [open, setOpen] = useState(false);
  const actions = useMemo(
    () => specialCharacterActions(view, canEdit, () => setOpen(true)),
    [view, canEdit],
  );
  const pick = useCallback(
    (text: string) => void (view && insertSpecialCharacter(view, text)),
    [view],
  );
  const close = () => {
    setOpen(false);
    if (view && !view.isDestroyed) view.focus();
  };
  const dialog =
    open && canEdit && view ? (
      <OfficeSpecialCharactersDialog onClose={close} onPick={pick} />
    ) : null;
  return { actions, dialog };
}
