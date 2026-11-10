// What the tab menu's Delete does to a tab (docs/specs/006-document/document-structure.md "Deleting a tab"). Pure: the
// menu asks it for every tab it opens on, and the tab chrome sends the press where it says.
//
// A tab among several is deleted (one commit, undo brings it back), asking first only when deleting does what an undo
// cannot take back (deleteTabWarning). A document's last tab deletes the document ("The last tab"): only for a session
// that may delete the document, at once when the tab is empty, and asking first when it holds content or has not
// loaded, so its content is never guessed at.
import { tabHoldsContent, type Tab } from '@livedoc/document';
import { deleteTabWarning } from '@/hooks/forms/forms-feeding';

// The question Delete asks first, in the anchored confirmation on its button.
export type DeleteConfirm = { message: string; warning?: string; confirmLabel: string };

export type TabDeletion =
  // The tab goes, the document stays.
  | { kind: 'tab'; confirm?: DeleteConfirm }
  // The tab is the document's last: the document goes, into its Trash.
  | { kind: 'document'; confirm?: DeleteConfirm }
  // Delete is greyed out, the reason its description.
  | { kind: 'blocked'; reason: string };

export const TAB_WARNING_MESSAGE = 'Delete this tab?';
export const LOCKED_TAB_REASON = 'This tab is locked. Unlock it before deleting.';
export const LAST_TAB_BLOCKED_REASON = 'This is the only tab, and you cannot delete the document.';
export const LAST_TAB_CONFIRM: DeleteConfirm = {
  message: 'Delete this document?',
  warning: 'This is its only tab, so the whole document goes to the Trash.',
  confirmLabel: 'Delete Document',
};

export function tabDeletion(input: {
  tabs: readonly Tab[];
  tabId: string;
  // The session may delete the document: its owner, or a joined member of its team, outside a workbench.
  canDeleteDocument: boolean;
  isTabLoaded: (tabId: string) => boolean;
}): TabDeletion {
  const { tabs, tabId } = input;
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return { kind: 'blocked', reason: 'This tab is no longer in the document.' };
  if (tab.locked === true) return { kind: 'blocked', reason: LOCKED_TAB_REASON };
  if (tabs.length > 1) {
    const warning = deleteTabWarning(tabs, tabId);
    return warning
      ? { kind: 'tab', confirm: { message: TAB_WARNING_MESSAGE, warning, confirmLabel: 'Delete' } }
      : { kind: 'tab' };
  }
  if (!input.canDeleteDocument) return { kind: 'blocked', reason: LAST_TAB_BLOCKED_REASON };
  const mayHoldContent = !input.isTabLoaded(tabId) || tabHoldsContent(tab);
  return mayHoldContent ? { kind: 'document', confirm: LAST_TAB_CONFIRM } : { kind: 'document' };
}

// Delete's description in the tab menu: what pressing it does, or why it cannot.
export function deleteDescription(deletion: TabDeletion): string {
  if (deletion.kind === 'blocked') return deletion.reason;
  return deletion.kind === 'document' ? 'Delete this tab and its document.' : 'Delete this tab.';
}
