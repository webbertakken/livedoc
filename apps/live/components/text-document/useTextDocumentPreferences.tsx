'use client';

// Tools > Preferences (docs/specs/034-text-documents/tools.md "Preferences"): the dialog, and the person's typing aids
// as the writing reads them, kept current when they change here or in another tab.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { PREFERENCES_CHANGED_EVENT } from '@/lib/user-preferences';
import {
  readTypingAids,
  saveTypingAids,
  TypingAids,
} from '@/lib/text-document/text-document-typing-aids';
import { TextDocumentPreferencesDialog } from './TextDocumentPreferencesDialog';

export const PREFERENCES_ITEM = 'preferences';

export function useTextDocumentPreferences(view: EditorView | null, ownerId: string | null) {
  const [aids, setAids] = useState<TypingAids>(readTypingAids);
  // What the writing reads as each character is typed: no preferences read per keystroke.
  const current = useRef(aids);
  const [opened, setOpened] = useState(0);
  useEffect(() => {
    current.current = aids;
  }, [aids]);
  useEffect(() => {
    const reread = () => setAids(readTypingAids());
    window.addEventListener(PREFERENCES_CHANGED_EVENT, reread);
    return () => window.removeEventListener(PREFERENCES_CHANGED_EVENT, reread);
  }, []);
  const actions = useMemo(
    (): OfficeActions => ({ [PREFERENCES_ITEM]: { run: () => setOpened((n) => n + 1) } }),
    [],
  );
  const close = () => {
    setOpened(0);
    view?.focus();
  };
  // Keyed by each opening, so it opens on the aids as they are now.
  const dialog = opened ? (
    <TextDocumentPreferencesDialog
      key={opened}
      open
      aids={aids}
      onClose={close}
      onSave={(next) => {
        const changed =
          JSON.stringify(TypingAids.stored(next)) !== JSON.stringify(TypingAids.stored(aids));
        // Counted before it is kept, as every preference flip is.
        if (changed) track('UI', 'Changed', 'TextDocumentPreferences');
        saveTypingAids(next, ownerId);
        setAids(next);
        debugLog('[text-document] preferences', { changed });
        close();
      }}
    />
  ) : null;
  const read = useCallback(() => current.current, []);
  return { actions, dialog, read };
}
