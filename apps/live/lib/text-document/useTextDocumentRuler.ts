// View > Show ruler (docs/specs/034-text-documents/editing-surface.md "The ruler"): on by default, per person,
// remembered in this browser; the menu item is checked while it is shown.
import { useMemo } from 'react';
import { useLocalStorageValue, writeLocalStorageValue } from '@/hooks/ui/useLocalStorageValue';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';

export const TEXT_DOCUMENT_RULER_KEY = 'livedoc:v2:text-document-ruler';
export const SHOW_RULER = 'show-ruler';

export function useTextDocumentRuler(): { shown: boolean; actions: OfficeActions } {
  const stored = useLocalStorageValue(TEXT_DOCUMENT_RULER_KEY);
  const shown = stored !== 'hidden';
  const actions = useMemo(
    (): OfficeActions => ({
      [SHOW_RULER]: {
        checked: shown,
        run: () => {
          // Counted before the change is kept, so hiding it is counted too.
          track('UI', 'Toggled', 'TextDocumentRuler');
          debugLog('[text-document] ruler shown', { shown: !shown });
          writeLocalStorageValue(TEXT_DOCUMENT_RULER_KEY, shown ? 'hidden' : 'shown');
        },
      },
    }),
    [shown],
  );
  return { shown, actions };
}
