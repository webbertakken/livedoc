'use client';

// Insert > Symbols > Special characters and Insert > Emoji (docs/specs/034-text-documents/objects.md "Special
// characters", "Emoji"): their dialogs, open while the session writes, each press put in at the caret of the writing
// the caret is in (the body, a header, a footer or a note); closing one gives the writing back its focus.
import { useCallback, useMemo, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import { OfficeEmojiDialog } from '@/components/office/OfficeEmojiDialog';
import { OfficeSpecialCharactersDialog } from '@/components/office/OfficeSpecialCharactersDialog';
import {
  characterDialogActions,
  insertPicked,
  type CharacterDialog,
} from '@/lib/text-document/text-document-special-characters';

export function useTextDocumentCharacterDialogs(view: EditorView | null, canEdit: boolean) {
  const [open, setOpen] = useState<CharacterDialog | null>(null);
  const actions = useMemo(() => characterDialogActions(view, canEdit, setOpen), [view, canEdit]);
  const pickCharacter = useCallback(
    (text: string) => void (view && insertPicked(view, text, 'special-characters')),
    [view],
  );
  const pickEmoji = useCallback(
    (text: string) => void (view && insertPicked(view, text, 'emoji')),
    [view],
  );
  const close = () => {
    setOpen(null);
    if (view && !view.isDestroyed) view.focus();
  };
  const dialog =
    !canEdit || !view ? null : open === 'special-characters' ? (
      <OfficeSpecialCharactersDialog onClose={close} onPick={pickCharacter} />
    ) : open === 'emoji' ? (
      <OfficeEmojiDialog onClose={close} onPick={pickEmoji} />
    ) : null;
  return { actions, dialog };
}
