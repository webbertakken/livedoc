// A text document made in this browser tab starts in its maker's defaults the first time it opens (docs/specs/
// 034-text-documents/text-and-paragraphs.md "Default styles", page-layout.md "Page setup"): its styles and its page
// setup, before anything is typed, never as an undo step; once, and only for a session that can edit it.
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { applyDefaultStylesToNew } from './text-document-default-styles';
import { takeTextDocumentMade } from './text-document-made';
import { applyDefaultPageSetupToNew } from './text-document-page-defaults';

export function startInMakersDefaults(
  doc: Y.Doc,
  { tabId, format, canEdit }: { tabId: string; format: TextDocumentFormat; canEdit: boolean },
): { styles: boolean; page: boolean } {
  if (!takeTextDocumentMade(tabId) || !canEdit) return { styles: false, page: false };
  return {
    styles: applyDefaultStylesToNew(doc, format),
    page: applyDefaultPageSetupToNew(doc, format),
  };
}
