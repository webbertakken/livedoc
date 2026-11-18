// What a new text document is made of (docs/specs/034-text-documents/text-document.md "The single-tab document"):
// one text document tab, named as the document is, with no card types or example cards. Its writing starts from the
// seed the room reads every state from.
import type { NewDocumentContent } from '@/lib/new-document-content';
import { newTextDocumentTab } from './text-document-tab';

export function textDocumentContent(tabId: string, name: string): NewDocumentContent {
  return { tabs: null, tab: newTextDocumentTab(tabId, name), itemTypes: null, seedItems: [] };
}
