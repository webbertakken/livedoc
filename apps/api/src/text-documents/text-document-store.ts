// A text document tab as its room stores it (docs/specs/034-text-documents/live-editing-and-storage.md "Storage"): its
// live state is a live tab kind's (live-tabs/live-tab-store.ts, TEXT_DOCUMENT_LIVE_TAB); its row holds its format.
import { textDocumentFormatOf, type TextDocumentFormat } from '@livedoc/document';
import { storedLiveTab } from '../live-tabs/live-tab-store';
import type { DocumentEnv } from '../types';
import { TEXT_DOCUMENT_LIVE_TAB } from './text-document-live-tab';

/** The text document tab as stored: its format; null when the document lacks the tab or it is another kind. */
export async function storedTextDocumentTab(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
): Promise<{ format: TextDocumentFormat } | null> {
  const data = await storedLiveTab(env, TEXT_DOCUMENT_LIVE_TAB, documentId, tabId);
  return data ? { format: textDocumentFormatOf(data) } : null;
}
