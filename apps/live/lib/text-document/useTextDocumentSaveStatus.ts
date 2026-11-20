'use client';

// The save status a text document's title row shows (docs/specs/034-text-documents/editing-surface.md "The title row"),
// read from its binding's save facts and whether the room is open; none before the binding exists.
import { useEffect, useSyncExternalStore } from 'react';
import type { OfficeSaveStatus } from '@/components/office/office-save-status';
import { debugLog } from '@/lib/debug-log';
import { TextDocumentBus } from './text-document-bus';
import {
  textDocumentSaveStatus,
  type SaveFacts,
  type SaveFactsSource,
} from './text-document-save-status';

const SETTLED: SaveFacts = { pending: false, failed: false };
const NO_SOURCE = () => () => {};
const onConnection = (listener: () => void) => TextDocumentBus.onConnection(() => listener());
const isConnected = () => TextDocumentBus.isConnected();

export function useTextDocumentSaveStatus(
  source: SaveFactsSource | null,
  local: boolean,
): OfficeSaveStatus | null {
  const facts = useSyncExternalStore(
    source?.subscribe ?? NO_SOURCE,
    source?.get ?? (() => SETTLED),
    () => SETTLED,
  );
  const connected = useSyncExternalStore(onConnection, isConnected, () => true);
  const status = source ? textDocumentSaveStatus({ ...facts, local, connected }) : null;
  useEffect(() => {
    if (status) debugLog('[text-document] save-status', { status });
  }, [status]);
  return status;
}
