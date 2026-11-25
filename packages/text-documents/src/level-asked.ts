// The level an update to a text document asks (docs/specs/034-text-documents/review.md "How a comment is kept"): the
// room judges a Participant's update by what it touches, never by what its sender says. Only `threads`, and in it only
// what is the sender's own: comments carrying its adder key added, edited or removed (the first removing its thread),
// threads begun with one, any thread resolved or reopened, its own key added to or taken from a reaction. Read by
// applying the update to the stored state, the threads before against after.
import { touchedRoots } from '@livedoc/live-updates';
import {
  LiveThreads,
  TEXT_DOCUMENT_COMMENT_TEXT_MAX,
  TEXT_DOCUMENT_THREAD_COMMENTS_MAX,
  TEXT_DOCUMENT_THREADS_MAX,
  THREADS_MAP,
  type TextDocumentComment,
  type TextDocumentThread,
} from './live/live-threads';
import { TextDocumentState } from './text-document-state';

/** The least level an update needs, or that it stands on changes the stored state lacks and cannot be judged. */
export type TextDocumentLevelAsked = 'participate' | 'edit' | 'unreadable';

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.byteLength === b.byteLength && a.every((byte, i) => byte === b[i]);

/** Whether a comment is the sender's own, and within its length. */
const ownComment = (comment: TextDocumentComment, key: string): boolean =>
  comment.author.key === key && comment.text.length <= TEXT_DOCUMENT_COMMENT_TEXT_MAX;

/** What a comment says, apart from its reactions. */
const said = ({ reactions: _reactions, ...rest }: TextDocumentComment) => rest;

/** Whether the reactions changed only by the sender's key. */
function ownReactions(
  before: TextDocumentComment,
  after: TextDocumentComment,
  key: string,
): boolean {
  const emojis = new Set([
    ...Object.keys(before.reactions ?? {}),
    ...Object.keys(after.reactions ?? {}),
  ]);
  for (const emoji of emojis) {
    const was = (before.reactions?.[emoji] ?? []).filter((k) => k !== key);
    const is = (after.reactions?.[emoji] ?? []).filter((k) => k !== key);
    if (!same(was, is)) return false;
  }
  return true;
}

/** Whether a thread's change is the sender's to make. */
function ownChange(before: TextDocumentThread, after: TextDocumentThread, key: string): boolean {
  if (before.tab !== after.tab || before.quote !== after.quote) return false;
  if (!sameBytes(before.start, after.start) || !sameBytes(before.end, after.end)) return false;
  if (after.comments.length > TEXT_DOCUMENT_THREAD_COMMENTS_MAX) return false;
  if (after.comments[0]!.id !== before.comments[0]!.id) return false;
  const was = new Map(before.comments.map((c) => [c.id, c]));
  const is = new Map(after.comments.map((c) => [c.id, c]));
  for (const [id, comment] of was) {
    const now = is.get(id);
    if (!now) {
      if (comment.author.key !== key) return false;
      continue;
    }
    if (!same(said(comment), said(now))) {
      if (comment.author.key !== key || !ownComment(now, key)) return false;
      if (!same(comment.author, now.author) || comment.at !== now.at) return false;
    }
    if (!ownReactions(comment, now, key)) return false;
  }
  for (const [id, comment] of is) if (!was.has(id) && !ownComment(comment, key)) return false;
  return true;
}

/** Whether a thread begun by the sender is theirs, open and anchored. */
const ownStart = (thread: TextDocumentThread, key: string): boolean =>
  !thread.resolved &&
  thread.start.byteLength > 0 &&
  thread.end.byteLength > 0 &&
  thread.comments.length <= TEXT_DOCUMENT_THREAD_COMMENTS_MAX &&
  thread.comments.every((c) => ownComment(c, key) && !c.reactions);

/**
 * The least level `update` needs on the state `stored` makes, sent by a session holding `adderKey` (none: it may
 * read, never comment).
 */
export function textDocumentLevelAsked(
  stored: readonly Uint8Array[],
  update: Uint8Array,
  adderKey: string | null,
): TextDocumentLevelAsked {
  const doc = TextDocumentState.load(stored);
  const before = new Map(LiveThreads.read(doc).map((t) => [t.id, t]));
  const touched = touchedRoots(doc, update);
  if (touched === 'unreadable') return 'unreadable';
  if ([...touched].some((root) => root !== THREADS_MAP)) return 'edit';
  if (adderKey === null) return 'edit';
  const after = LiveThreads.read(doc);
  if (after.length > TEXT_DOCUMENT_THREADS_MAX) return 'edit';
  const now = new Map(after.map((t) => [t.id, t]));
  for (const [id, thread] of before)
    if (!now.has(id) && thread.comments[0]!.author.key !== adderKey) return 'edit';
  for (const thread of after) {
    const was = before.get(thread.id);
    if (was ? !ownChange(was, thread, adderKey) : !ownStart(thread, adderKey)) return 'edit';
  }
  return 'participate';
}
