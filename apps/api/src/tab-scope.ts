// What a link to one tab reaches (docs/specs/013-workspace/tab-scoped-share-links.md "Drawing tabs"): its tab, and the
// drawing tabs that belong to it, judged as each request arrives so a drawing stored after the visitor came is in
// reach. A null scope (the owner, a team member, an All-tabs link) reaches every tab.
import type { DocumentEnv, Env } from './types';

/** Whether `tabId` is in `tabScope`, given each tab's text document tab (`drawingOf`); pure, for the room. */
export function scopeAdmits(
  tabScope: string | null,
  tabId: string,
  drawingOf: (tabId: string) => string | null,
): boolean {
  return tabScope === null || tabId === tabScope || drawingOf(tabId) === tabScope;
}

/**
 * Whether a request touching `tabId` (undefined: the whole document) is in `tabScope`: one read of the tab's
 * `drawing_of` in this document, made only when the scope is another tab. The read runs inside the document's room,
 * whose SQLite holds the tabs (`DOCUMENT_DB`), where every door that names a tab is answered; asked anywhere else
 * (a worker door, which has no `DOCUMENT_DB`) it admits only the scope's own tab, logged.
 */
export async function isTabInScope(
  env: Env | DocumentEnv,
  documentId: string,
  tabScope: string | null,
  tabId: string | undefined,
): Promise<boolean> {
  if (tabScope === null) return true;
  if (tabId === undefined) return false;
  if (tabId === tabScope) return true;
  if (!('DOCUMENT_DB' in env)) {
    console.warn('[tab-scope] drawing unread outside the room', { documentId, tabScope, tabId });
    return false;
  }
  const row = await env.DOCUMENT_DB.prepare(
    `SELECT t.drawing_of FROM tabs t
       JOIN document_tabs dt ON dt.tab_id = t.id AND dt.document_id = ?1
      WHERE t.id = ?2`,
  )
    .bind(documentId, tabId)
    .first<{ drawing_of: string | null }>();
  return row?.drawing_of === tabScope;
}
