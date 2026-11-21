'use client';

// The save status a text document's title row shows (docs/specs/034-text-documents/editing-surface.md "The title row"),
// as a source the row watches where it draws it; none before the binding exists.
import { useMemo } from 'react';
import type { OfficeSaveStatusSource } from '@/components/office/office-save-status';
import { debugLog } from '@/lib/debug-log';
import { TextDocumentBus } from './text-document-bus';
import { textDocumentSaveStatusSource, type SaveFactsSource } from './text-document-save-status';

const CONNECTION = {
  get: () => TextDocumentBus.isConnected(),
  subscribe: (listener: () => void) => TextDocumentBus.onConnection(() => listener()),
};

export function useTextDocumentSaveStatus(
  source: SaveFactsSource | null,
  local: boolean,
): OfficeSaveStatusSource | null {
  return useMemo(
    () => (source ? textDocumentSaveStatusSource(source, local, CONNECTION, debugLog) : null),
    [source, local],
  );
}
