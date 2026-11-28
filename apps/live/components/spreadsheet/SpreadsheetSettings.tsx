'use client';

// File › Settings in the surface (docs/specs/029-sheets/settings.md "Spreadsheet settings"): the dialog over the
// workbook's settings, Cards From's choices from the Editor's own documents (D512), and Save Settings as one undo step
// (undo saves the settings as they were, redo them again), applied without waiting for the room.
import { useCallback, useMemo } from 'react';
import type { DocumentSummary } from '@livedoc/api-schema';
import type { WorkbookRecord, WorkbookSettings } from '@livedoc/sheets';
import { useOwnDocuments } from '@/components/dialogs/useOwnDocuments';
import type { ItemUndoStep } from '@/hooks/plan/item-undo-journal';
import { apiSaveWorkbookSettings, type WorkbookScope } from '@/lib/api/workbook';
import { debugLog } from '@/lib/debug-log';
import {
  ANOTHER_DOCUMENT,
  cardsDocumentOptions,
  NO_CARDS_DOCUMENT,
  type SettingsOption,
} from '@/lib/spreadsheet/spreadsheet-settings';
import { track } from '@/lib/telemetry';
import { SpreadsheetSettingsDialog } from './SpreadsheetSettingsDialog';

const ALL = (documents: readonly DocumentSummary[]) => [...documents];

export function SpreadsheetSettings({
  scope,
  settings,
  onWorkbook,
  pushUndo,
  onClose,
}: {
  scope: WorkbookScope;
  settings: WorkbookSettings;
  onWorkbook: ((workbook: WorkbookRecord) => void) | undefined;
  pushUndo: (step: ItemUndoStep) => void;
  onClose: () => void;
}) {
  const { listing } = useOwnDocuments(scope.ownerId, ALL, 'spreadsheet settings');
  const current = settings.cardsDocument;
  const cardsOptions = useMemo((): SettingsOption[] => {
    if (listing.state === 'ready')
      return cardsDocumentOptions(listing.documents, current, scope.documentId);
    const none = { value: NO_CARDS_DOCUMENT, label: 'None' };
    if (!current) return [none];
    const label = listing.state === 'loading' ? 'Loading your documents…' : ANOTHER_DOCUMENT;
    return [none, { value: current, label }];
  }, [listing, current, scope.documentId]);

  const put = useCallback(
    async (next: WorkbookSettings): Promise<boolean> => {
      try {
        const { workbook } = await apiSaveWorkbookSettings(scope, next);
        onWorkbook?.(workbook);
        debugLog('[workbook] settings saved', {
          locale: next.locale,
          timeZone: next.timeZone,
          recalc: next.recalc,
          cards: next.cardsDocument ?? null,
        });
        return true;
      } catch (error) {
        console.warn('[workbook] settings not saved', { error: String(error) });
        return false;
      }
    },
    [scope, onWorkbook],
  );

  const save = useCallback(
    async (next: WorkbookSettings) => {
      track('Spreadsheet', 'Changed', 'Settings');
      const before = settings;
      const saved = await put(next);
      if (saved) pushUndo({ undo: () => void put(before), redo: () => void put(next) });
      return saved;
    },
    [settings, put, pushUndo],
  );

  return (
    <SpreadsheetSettingsDialog
      settings={settings}
      cardsOptions={cardsOptions}
      onSave={save}
      onClose={onClose}
    />
  );
}
