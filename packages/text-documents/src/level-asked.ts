// The level an update to a text document asks (docs/specs/034-text-documents/review.md "How a comment is kept"): the
// room judges a Participant's update by what it touches, never by what its sender says. Only `threads`, and in it only
// what is the sender's own: comments carrying its adder key added, edited or removed (the first removing its thread),
// threads begun with one, any thread resolved or reopened, its own key added to or taken from a reaction; and in the
// document tabs' bodies only its own suggestions ("How a suggestion is kept"), the writing reading the same with them
// rejected. Read by applying the update to the stored state, the threads and bodies before against after.
import { MENTIONS_MAX, sanitizeMentions } from '@livedoc/document';
import { touchedRoots } from '@livedoc/live-updates';
import {
  LiveThreads,
  REACTION_EMOJI_MAX,
  TEXT_DOCUMENT_COMMENT_TEXT_MAX,
  TEXT_DOCUMENT_REACTIONS_MAX,
  TEXT_DOCUMENT_THREAD_COMMENTS_MAX,
  TEXT_DOCUMENT_THREADS_MAX,
  THREADS_MAP,
  type TextDocumentComment,
  type TextDocumentThread,
} from './live/live-threads';
import { BODY_FRAGMENT, tabFragmentName } from './live/live-root';
import {
  LiveSuggestions,
  SUGGESTION_ID_MAX,
  TEXT_DOCUMENT_SUGGESTIONS_MAX,
} from './live/live-suggestions';
import { liveTabIds } from './live/live-tabs';
import { TextDocumentState } from './text-document-state';

/** The least level an update needs, or that it stands on changes the stored state lacks and cannot be judged. */
export type TextDocumentLevelAsked = 'participate' | 'edit' | 'unreadable';

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.byteLength === b.byteLength && a.every((byte, i) => byte === b[i]);

const MENTION_FIELDS = new Set(['userId', 'memberId', 'name', 'handle']);

/** Whether a comment's mentions are none, or at most so many in the shared shape (review.md "Mentions"). */
const mentionsWithin = ({ mentions }: TextDocumentComment): boolean =>
  mentions === undefined ||
  mentions.length === 0 ||
  (mentions.length <= MENTIONS_MAX &&
    sanitizeMentions(mentions)?.length === mentions.length &&
    mentions.every((m) => Object.keys(m as object).every((field) => MENTION_FIELDS.has(field))));

/** Whether a comment assigns no one, or one of the people it mentions (review.md "Assigning"). */
const assigneeWithin = ({ assignee, mentions }: TextDocumentComment): boolean =>
  assignee === undefined ||
  (typeof assignee === 'object' &&
    assignee !== null &&
    (mentions ?? []).some((m) => sameFields(m, assignee)));

/** Whether two plain objects hold the same fields, whatever their order. */
const sameFields = (a: unknown, b: unknown): boolean => {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  const left = Object.entries(a).sort(([x], [y]) => (x < y ? -1 : 1));
  const right = Object.entries(b).sort(([x], [y]) => (x < y ? -1 : 1));
  return same(left, right);
};

/** Whether a comment is the sender's own, within its length, its mentions' limits and its assignee's. */
const ownComment = (comment: TextDocumentComment, key: string): boolean =>
  comment.author.key === key &&
  comment.text.length <= TEXT_DOCUMENT_COMMENT_TEXT_MAX &&
  mentionsWithin(comment) &&
  assigneeWithin(comment);

/** What a comment says, apart from its reactions. */
const said = ({ reactions: _reactions, ...rest }: TextDocumentComment) => rest;

/** Whether a comment's reactions are within the limits: so many emoji, each so long. */
const reactionsWithin = (comment: TextDocumentComment): boolean => {
  const emojis = Object.keys(comment.reactions ?? {});
  return (
    emojis.length <= TEXT_DOCUMENT_REACTIONS_MAX &&
    emojis.every((e) => e.length <= REACTION_EMOJI_MAX)
  );
};

/** Whether the reactions changed only by the sender's key. */
function ownReactions(
  before: TextDocumentComment,
  after: TextDocumentComment,
  key: string,
): boolean {
  if (!reactionsWithin(after)) return false;
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
  if (before.suggestion !== after.suggestion) return false;
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
  for (const [id, comment] of is)
    if (!was.has(id) && (!ownComment(comment, key) || comment.reactions)) return false;
  return true;
}

/** Whether a thread begun by the sender is theirs, open and anchored. */
const ownStart = (thread: TextDocumentThread, key: string): boolean =>
  !thread.resolved &&
  (thread.suggestion === undefined || thread.suggestion.length <= SUGGESTION_ID_MAX) &&
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
  const bodies = new Set(liveTabIds(doc).map(tabFragmentName)).add(BODY_FRAGMENT);
  const touched = touchedRoots(doc, update);
  if (touched === 'unreadable') return 'unreadable';
  if ([...touched].some((root) => root !== THREADS_MAP && !bodies.has(root))) return 'edit';
  if (adderKey === null) return 'edit';
  if (touched.has(THREADS_MAP) && !ownThreads(before, LiveThreads.read(doc), adderKey))
    return 'edit';
  const writing = [...touched].filter((root) => bodies.has(root));
  if (writing.length > 0 && !ownSuggestions(stored, doc, writing, adderKey)) return 'edit';
  return 'participate';
}

/** Whether the threads changed only as the sender may change them. */
function ownThreads(
  before: ReadonlyMap<string, TextDocumentThread>,
  after: readonly TextDocumentThread[],
  adderKey: string,
): boolean {
  if (after.length > TEXT_DOCUMENT_THREADS_MAX) return false;
  const now = new Map(after.map((t) => [t.id, t]));
  for (const [id, thread] of before)
    if (!now.has(id) && thread.comments[0]!.author.key !== adderKey) return false;
  for (const thread of after) {
    const was = before.get(thread.id);
    if (was ? !ownChange(was, thread, adderKey) : !ownStart(thread, adderKey)) return false;
  }
  return true;
}

/**
 * Whether the writing changed only by the sender's own suggestions (review.md "How a suggestion is kept"): each touched
 * body reads the same with the sender's suggestions rejected before and after, their marks are well formed, and the
 * document holds no more suggestions than it may.
 */
function ownSuggestions(
  stored: readonly Uint8Array[],
  after: ReturnType<typeof TextDocumentState.load>,
  roots: readonly string[],
  adderKey: string,
): boolean {
  const before = TextDocumentState.load(stored);
  for (const root of roots) {
    const now = after.getXmlFragment(root);
    if (!LiveSuggestions.ownMarksWellFormed(now, adderKey)) return false;
    if (
      LiveSuggestions.ownRejected(before.getXmlFragment(root), adderKey) !==
      LiveSuggestions.ownRejected(now, adderKey)
    )
      return false;
  }
  const count = LiveSuggestions.count(after);
  return count <= TEXT_DOCUMENT_SUGGESTIONS_MAX || count <= LiveSuggestions.count(before);
}
