// The reading pane's verbs (docs/specs/013-workspace/inbox.md §1.5):
// which a row is offered, so no page shows a verb it can't carry out, and the comment calls behind Reply and
// Resolve. Open is not among them: every row has it.

import type { ActivityThread, DocumentCommentThread } from '@livedoc/api-schema';
import { apiAddComment, apiListCommentThreads, apiSetThreadResolved } from '@/lib/api-client';
import type { InboxEntry } from './inbox-entries';

export type InboxVerb = 'reply' | 'resolve' | 'done';

/** The editor's Mark Done for the tab it has open (§5): absent on the page, and where the session may not. */
export type InboxDone = {
  documentId: string;
  tabId: string;
  markDone: (elementId: string, actionId: string) => void;
};

const NONE: readonly InboxVerb[] = [];
const THREAD_VERBS: readonly InboxVerb[] = ['reply', 'resolve'];
const DONE_VERBS: readonly InboxVerb[] = ['done'];

export function offeredVerbs(e: InboxEntry, done: InboxDone | null): readonly InboxVerb[] {
  // No page here reaches the browser's store but the editor.
  if ('local' in e.row && e.row.local === true) return NONE;
  if (e.kind === 'Thread') return e.row.canComment ? THREAD_VERBS : NONE;
  if (e.kind === 'Action' && done) {
    return done.documentId === e.row.documentId && done.tabId === e.row.tabId ? DONE_VERBS : NONE;
  }
  // A Plan card's done is its board's column; a card thread is answered on the card; a form has nothing to do.
  return NONE;
}

/** The row's own open thread (an element's, never one of a Sheet's cells), or null when it is no longer open. */
export async function readThread(
  ownerId: string,
  row: ActivityThread,
  signal?: AbortSignal,
): Promise<DocumentCommentThread | null> {
  const threads = await apiListCommentThreads(
    ownerId,
    row.documentId,
    'open',
    row.shareCode,
    signal,
  );
  return (
    threads.find(
      (t) => t.tabId === row.tabId && t.elementId === row.elementId && t.cell === undefined,
    ) ?? null
  );
}

/** A reply appends to the element's own thread, as the editor's comment field does. */
export async function replyToThread(
  ownerId: string,
  row: ActivityThread,
  text: string,
): Promise<void> {
  await apiAddComment(ownerId, row.documentId, row.tabId, row.elementId, text, row.shareCode);
}

/** Resolves the thread, named by its first comment: the one the pane read, else read now. */
export async function resolveThread(
  ownerId: string,
  row: ActivityThread,
  thread: DocumentCommentThread | null,
): Promise<void> {
  const known = thread ?? (await readThread(ownerId, row));
  const first = known?.comments[0];
  if (!first) throw new Error('thread_gone');
  await apiSetThreadResolved(ownerId, row.documentId, row.tabId, first.id, true, row.shareCode);
}
