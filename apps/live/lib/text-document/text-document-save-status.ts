// Which save status a text document shows (docs/specs/034-text-documents/editing-surface.md "The title row"): every
// live tab kind's, logged under the text document's tag.
import type { OfficeSaveStatusSource } from '@/components/office/office-save-status';
import {
  liveTabSaveFacts,
  liveTabSaveStatus,
  liveTabSaveStatusSource,
  type ConnectionSource,
  type SaveFacts,
  type SaveFactsSource,
} from '@/lib/live-tab/live-tab-save-status';

const TAG = '[text-document]';
type Log = (message: string, data: object) => void;

export type { ConnectionSource, SaveFacts, SaveFactsSource };

export const textDocumentSaveStatus = liveTabSaveStatus;

/** The facts a binding keeps: each change is told to its watchers, and logged. */
export const saveFactsStore = (tabId: string, log: Log) => liveTabSaveFacts(TAG, tabId, log);

/** The status the title row shows, read and watched where it is drawn; each status it changes to is logged. */
export const textDocumentSaveStatusSource = (
  facts: SaveFactsSource,
  local: boolean,
  connection: ConnectionSource,
  log: Log,
): OfficeSaveStatusSource => liveTabSaveStatusSource(TAG, facts, local, connection, log);
