// Whether a tab holds content, by the empty document clean-up's test (docs/specs/013-workspace/empty-document-cleanup.md
// "Which documents"): an element, an article, a form or a filled dashboard slot. Nothing else counts: a name, a
// tab's settings or a lock never do. The document's room asks the same of a stored tab in SQL
// (apps/api/src/document-room/content-summary.ts); the editor asks it of one tab, to decide whether deleting a
// document's last tab asks first (docs/specs/006-document/document-structure.md "The last tab").
import type { Tab } from './index';

export function tabHoldsContent(tab: Tab): boolean {
  if (tab.elements.length > 0) return true;
  if (tab.articles && Object.keys(tab.articles).length > 0) return true;
  if (tab.form) return true;
  return (tab.dashboard?.rows ?? []).some((row) => row.slots.some((slot) => slot.content));
}
