// The level an update to a text document asks (docs/specs/034-text-documents/review.md "How a comment is kept"): the
// room judges a Participant's update by what it touches, never by what its sender says. Only `threads`, and in it only
// what is the sender's own: comments carrying its adder key added, edited or removed (the first removing its thread),
// threads begun with one, any thread resolved or reopened, its own key added to or taken from a reaction; and in the
// document tabs' bodies only its own suggestions ("How a suggestion is kept"), the writing reading the same with them
// rejected; and in `media` only new media its own suggested pictures name. Read by applying the update to the stored
// state, the threads, bodies and media before against after.
import * as Y from 'yjs';
import { MAX_IMAGE_BYTES } from '@livedoc/api-schema';
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
import { liveStoryIds, STORY_PREFIX } from './live/live-stories';
import { liveMediaOf } from './live/live-read';
import { FOOTNOTE, INSERTION_MARK, MEDIA_MAP, PICTURE } from './live/live-names';
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
  // A header's, footer's or note's writing is judged as a body's (review.md "How a suggestion is kept"): the stories
  // the document names once the update is in; a fragment nothing names is no writing of its own.
  for (const id of liveStoryIds(doc)) bodies.add(`${STORY_PREFIX}${id}`);
  if ([...touched].some((root) => root !== THREADS_MAP && root !== MEDIA_MAP && !bodies.has(root)))
    return 'edit';
  if (adderKey === null) return 'edit';
  if (touched.has(MEDIA_MAP) && !ownMedia(stored, update, doc, bodies, adderKey)) return 'edit';
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
  const known = new Set(liveStoryIds(before).map((id) => `${STORY_PREFIX}${id}`));
  for (const root of roots) {
    const now = after.getXmlFragment(root);
    if (!LiveSuggestions.ownMarksWellFormed(now, adderKey)) return false;
    // A note new in the update, named only by the sender's own suggested footnotes, is theirs whole: what is left with
    // their suggestions rejected is its empty paragraphs (review.md "Headers, footers and notes").
    if (root.startsWith(STORY_PREFIX) && !known.has(root)) {
      if (!ownNewNote(after, root.slice(STORY_PREFIX.length), now, adderKey)) return false;
      continue;
    }
    if (
      LiveSuggestions.ownRejected(before.getXmlFragment(root), adderKey) !==
      LiveSuggestions.ownRejected(now, adderKey)
    )
      return false;
  }
  const count = LiveSuggestions.count(after);
  return count <= TEXT_DOCUMENT_SUGGESTIONS_MAX || count <= LiveSuggestions.count(before);
}

/** The empty writing: what a new note may leave once its author's suggestions are rejected. */
const EMPTY_NOTE = (() => {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('note');
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText()]);
  fragment.insert(0, [paragraph]);
  return [
    LiveSuggestions.ownRejected(doc.getXmlFragment('none'), ''),
    LiveSuggestions.ownRejected(fragment, ''),
  ];
})();

/** Whether a note new in the update is named only by the sender's own suggested footnotes and holds only theirs. */
function ownNewNote(doc: Y.Doc, story: string, note: Y.XmlFragment, adderKey: string): boolean {
  const marks = liveTabIds(doc).flatMap(
    (tab) =>
      [
        ...doc
          .getXmlFragment(tabFragmentName(tab))
          .createTreeWalker(
            (n) =>
              n instanceof Y.XmlElement &&
              n.nodeName === FOOTNOTE &&
              n.getAttribute('story') === story,
          ),
      ] as Y.XmlElement[],
  );
  if (marks.length === 0) return false;
  if (
    !marks.every((m) =>
      LiveSuggestions.isOwnMark(m.getAttribute(INSERTION_MARK) as unknown, adderKey),
    )
  )
    return false;
  return EMPTY_NOTE.includes(LiveSuggestions.ownRejected(note, adderKey));
}

/** The media keys the pictures of the sender's own suggested insertion name, in the bodies. */
function ownPictureMedia(doc: Y.Doc, bodies: ReadonlySet<string>, adderKey: string): Set<string> {
  const keys = new Set<string>();
  for (const root of bodies)
    for (const node of doc
      .getXmlFragment(root)
      .createTreeWalker((n) => n instanceof Y.XmlElement && n.nodeName === PICTURE)) {
      const picture = node as Y.XmlElement;
      const insertion = picture.getAttribute(INSERTION_MARK) as unknown;
      const key = picture.getAttribute('media') as unknown;
      if (LiveSuggestions.isOwnMark(insertion, adderKey) && typeof key === 'string') keys.add(key);
    }
  return keys;
}

/**
 * Whether the media changed only as the sender may change it (review.md "How a suggestion is kept"): each key the update
 * writes is new, reads as media within the upload cap, and is named by a picture of the sender's own suggested
 * insertion in the writing after the update.
 */
function ownMedia(
  stored: readonly Uint8Array[],
  update: Uint8Array,
  after: Y.Doc,
  bodies: ReadonlySet<string>,
  adderKey: string,
): boolean {
  const replay = TextDocumentState.load(stored);
  const media = replay.getMap<unknown>(MEDIA_MAP);
  const held = new Set(media.keys());
  const written = new Set<string>();
  media.observe((event) => {
    for (const key of event.keysChanged as Set<string>) written.add(key);
  });
  Y.applyUpdate(replay, update);
  const named = ownPictureMedia(after, bodies, adderKey);
  for (const key of written) {
    if (held.has(key) || !named.has(key)) return false;
    const value = liveMediaOf(after, key);
    if (!value || (value.bytes && value.bytes.byteLength > MAX_IMAGE_BYTES)) return false;
  }
  return true;
}
