// What a new text document is made of (docs/specs/034-text-documents/text-document.md "The single-tab document"):
// one text document tab, named as the document is, with no card types or example cards. A blank's writing starts from
// the seed the room reads every state from; a template's is its tab's whole state, made from the template
// (starting-and-finding.md "The template gallery's text documents").
import type { NewDocumentContent } from '@/lib/new-document-content';
import { debugLog } from '@/lib/debug-log';
import { newTextDocumentTab } from './text-document-tab';

export function textDocumentContent(tabId: string, name: string): NewDocumentContent {
  return { tabs: null, tab: newTextDocumentTab(tabId, name), itemTypes: null, seedItems: [] };
}

/** A template's text document, named after it, or null for an id no template has. Loads the templates on first use. */
export async function textDocumentTemplateContent(
  tabId: string,
  id: string,
): Promise<{ content: NewDocumentContent; name: string } | null> {
  const [{ textDocumentTemplateOf }, { TextDocumentState }] = await Promise.all([
    import('@livedoc/text-documents/templates'),
    import('@livedoc/text-documents'),
  ]);
  const template = textDocumentTemplateOf(id);
  if (!template) {
    debugLog(`[text-template] unknown id=${id}`);
    return null;
  }
  const { name } = template;
  // Born in OpenDocument (fork C5), as a template is written.
  return {
    name,
    content: {
      tabs: null,
      tab: newTextDocumentTab(tabId, name, 'odf'),
      itemTypes: null,
      seedItems: [],
      textDocuments: [{ tabId, state: TextDocumentState.fromDocument(template.build()) }],
    },
  };
}
