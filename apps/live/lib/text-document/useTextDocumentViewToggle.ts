// A View menu switch a person keeps in this browser (docs/specs/034-text-documents/editing-surface.md "The ruler",
// text-and-paragraphs.md "Non-printing characters"): its item checked while it is on, the flip counted first.
import { useMemo } from 'react';
import { useLocalStorageValue, writeLocalStorageValue } from '@/hooks/ui/useLocalStorageValue';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';

export type ViewToggle = {
  /** The menu item it binds. */
  readonly item: string;
  /** Where this browser keeps it. */
  readonly key: string;
  readonly onByDefault: boolean;
  /** Its telemetry type, under `UI · Toggled`. */
  readonly telemetry: string;
};

export const RULER_TOGGLE: ViewToggle = {
  item: 'show-ruler',
  key: 'livedoc:v2:text-document-ruler',
  onByDefault: true,
  telemetry: 'TextDocumentRuler',
};

export const NON_PRINTING_TOGGLE: ViewToggle = {
  item: 'show-non-printing-characters',
  key: 'livedoc:v2:text-document-marks',
  onByDefault: false,
  telemetry: 'TextDocumentNonPrinting',
};

/** View > Show print layout (page-layout.md "Print layout"): on by default, as Google's. */
export const PRINT_LAYOUT_TOGGLE: ViewToggle = {
  item: 'show-print-layout',
  key: 'livedoc:v2:text-document-print-layout',
  onByDefault: true,
  telemetry: 'TextDocumentPrintLayout',
};

export function useTextDocumentViewToggle(toggle: ViewToggle): {
  shown: boolean;
  actions: OfficeActions;
} {
  const stored = useLocalStorageValue(toggle.key);
  const shown = stored === null ? toggle.onByDefault : stored === 'shown';
  const actions = useMemo(
    (): OfficeActions => ({
      [toggle.item]: {
        checked: shown,
        run: () => {
          // Counted before the change is kept, so turning it off is counted too.
          track('UI', 'Toggled', toggle.telemetry);
          debugLog('[text-document] view toggled', { item: toggle.item, shown: !shown });
          writeLocalStorageValue(toggle.key, shown ? 'hidden' : 'shown');
        },
      },
    }),
    [shown, toggle],
  );
  return { shown, actions };
}
