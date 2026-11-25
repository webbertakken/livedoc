// Comment threads in the live state (docs/specs/034-text-documents/review.md "How a comment is kept"): the root map
// `threads` beside the writing holds each thread by id, a Y.Map of its tab, its anchor (the stretch's start and end as
// encoded Yjs relative positions), its quote, whether it is resolved, and its comments by id, each a Y.Map, so that
// two people replying, editing and reacting at once all keep what they did. Nothing here ever touches the writing.
import * as Y from 'yjs';
import { THREADS_MAP } from './live-names';

export { THREADS_MAP };

/** The longest comment, as LiveDoc's comments (api-schema's COMMENT_TEXT_MAX). */
export const TEXT_DOCUMENT_COMMENT_TEXT_MAX = 2000;
/** The most threads one document holds (review.md, (default)). */
export const TEXT_DOCUMENT_THREADS_MAX = 2000;
/** The most comments one thread holds (review.md, (default)). */
export const TEXT_DOCUMENT_THREAD_COMMENTS_MAX = 500;

/** Who wrote a comment: their adder key on the document, or a file's name for them with no key. */
export type TextDocumentCommentAuthor = {
  readonly key?: string;
  readonly name: string;
  /** A file's initials for them, where it had them. */
  readonly initials?: string;
  readonly colour: string;
  readonly fromFile?: true;
};

export type TextDocumentComment = {
  readonly id: string;
  readonly text: string;
  /** When it was made (ms); kept through edits. */
  readonly at: number;
  /** When it was last edited (ms). */
  readonly edited?: number;
  readonly author: TextDocumentCommentAuthor;
  readonly mentions?: readonly unknown[];
  readonly assignee?: unknown;
  /** Each emoji's reactors by key, sorted; an emoji with none is absent. */
  readonly reactions?: Readonly<Record<string, readonly string[]>>;
};

export type TextDocumentThread = {
  readonly id: string;
  readonly tab: string;
  readonly start: Uint8Array;
  readonly end: Uint8Array;
  readonly quote: string;
  readonly resolved: boolean;
  readonly comments: readonly TextDocumentComment[];
};

/** What begins a thread: its anchor, quote and first comment. */
export type TextDocumentThreadStart = Omit<TextDocumentThread, 'resolved' | 'comments'> & {
  readonly comment: TextDocumentComment;
};

/** A thread's anchor as it stands, or `deleted` once its start and end meet (every character gone). */
export type TextDocumentThreadAnchor = {
  readonly start: Y.AbsolutePosition;
  readonly end: Y.AbsolutePosition;
  readonly deleted: boolean;
};

type YThread = Y.Map<unknown>;

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const numberOf = (value: unknown): number => (typeof value === 'number' ? value : 0);

const threadsOf = (doc: Y.Doc): Y.Map<YThread> => doc.getMap<YThread>(THREADS_MAP);

const commentsOf = (thread: YThread): Y.Map<Y.Map<unknown>> | undefined => {
  const comments = thread.get('comments');
  return comments instanceof Y.Map ? (comments as Y.Map<Y.Map<unknown>>) : undefined;
};

const byTimeThenId = (a: { at: number; id: string }, b: { at: number; id: string }): number =>
  a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The comments with the thread's first one first, whatever the clocks of those who replied said. */
const firstThen = (first: string, comments: TextDocumentComment[]): TextDocumentComment[] => {
  const at = comments.findIndex((c) => c.id === first);
  return at <= 0 ? comments : [comments[at]!, ...comments.slice(0, at), ...comments.slice(at + 1)];
};

function commentMap(comment: TextDocumentComment): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set('text', comment.text);
  map.set('at', comment.at);
  if (comment.edited !== undefined) map.set('edited', comment.edited);
  map.set('author', { ...comment.author });
  if (comment.mentions?.length) map.set('mentions', [...comment.mentions]);
  if (comment.assignee !== undefined) map.set('assignee', comment.assignee);
  return map;
}

function readReactions(map: Y.Map<unknown>): TextDocumentComment['reactions'] {
  const reactions = map.get('reactions');
  if (!(reactions instanceof Y.Map)) return undefined;
  const out: Record<string, string[]> = {};
  for (const [emoji, keys] of (reactions as Y.Map<unknown>).entries()) {
    if (!(keys instanceof Y.Map) || keys.size === 0) continue;
    out[emoji] = [...(keys as Y.Map<unknown>).keys()].sort();
  }
  return Object.keys(out).length ? out : undefined;
}

function readComment(id: string, map: Y.Map<unknown>): TextDocumentComment {
  const edited = map.get('edited');
  const mentions = map.get('mentions');
  const assignee = map.get('assignee');
  const reactions = readReactions(map);
  return {
    id,
    text: stringOf(map.get('text')),
    at: numberOf(map.get('at')),
    ...(typeof edited === 'number' ? { edited } : {}),
    author: (map.get('author') ?? { name: '', colour: '' }) as TextDocumentCommentAuthor,
    ...(Array.isArray(mentions) ? { mentions } : {}),
    ...(assignee !== undefined ? { assignee } : {}),
    ...(reactions ? { reactions } : {}),
  };
}

function readThread(id: string, thread: YThread): TextDocumentThread | null {
  const comments = commentsOf(thread);
  if (!comments || comments.size === 0) return null;
  const bytes = (key: string): Uint8Array => {
    const value = thread.get(key);
    return value instanceof Uint8Array ? value : new Uint8Array();
  };
  return {
    id,
    tab: stringOf(thread.get('tab')),
    start: bytes('start'),
    end: bytes('end'),
    quote: stringOf(thread.get('quote')),
    resolved: thread.get('resolved') === true,
    comments: firstThen(
      stringOf(thread.get('first')),
      [...comments.entries()].map(([cid, c]) => readComment(cid, c)).sort(byTimeThenId),
    ),
  };
}

/** A comment's map in a thread, or undefined. */
function commentAt(doc: Y.Doc, threadId: string, commentId: string): Y.Map<unknown> | undefined {
  const thread = threadsOf(doc).get(threadId);
  return thread ? commentsOf(thread)?.get(commentId) : undefined;
}

const resolveAt = (doc: Y.Doc, bytes: Uint8Array): Y.AbsolutePosition | null => {
  if (bytes.byteLength === 0) return null;
  try {
    return Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(bytes), doc);
  } catch {
    return null;
  }
};

export const LiveThreads = {
  /** Every thread with comments, by its first comment's time, then id; its first comment first, the rest by time. */
  read: (doc: Y.Doc): TextDocumentThread[] =>
    [...threadsOf(doc).entries()]
      .map(([id, thread]) => readThread(id, thread))
      .filter((t): t is TextDocumentThread => t !== null)
      .sort((a, b) =>
        byTimeThenId({ at: a.comments[0]!.at, id: a.id }, { at: b.comments[0]!.at, id: b.id }),
      ),

  /**
   * The anchor of the stretch `from` to `to` of one run of text: the start tied to its first character, so text typed
   * before it stays out, and the end to its last, so text typed after it stays out.
   */
  anchorFor: (
    type: Y.XmlText | Y.XmlElement | Y.XmlFragment | Y.Text,
    from: number,
    to: number,
  ): { start: Uint8Array; end: Uint8Array } => ({
    start: Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(type, from, 0)),
    end: Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(type, to, -1)),
  }),

  /** Where a thread's stretch stands now, or null where its positions no longer resolve. */
  anchor: (doc: Y.Doc, thread: TextDocumentThread): TextDocumentThreadAnchor | null => {
    const start = resolveAt(doc, thread.start);
    const end = resolveAt(doc, thread.end);
    if (!start || !end) return null;
    return {
      start,
      end,
      deleted: thread.quote !== '' && start.type === end.type && start.index >= end.index,
    };
  },

  /** Begins a thread with its first comment; false when one with its id is there already. */
  begin: (doc: Y.Doc, start: TextDocumentThreadStart, origin: unknown): boolean => {
    const threads = threadsOf(doc);
    if (threads.has(start.id)) return false;
    doc.transact(() => {
      const thread = new Y.Map<unknown>();
      thread.set('tab', start.tab);
      thread.set('start', start.start);
      thread.set('end', start.end);
      thread.set('quote', start.quote);
      thread.set('resolved', false);
      thread.set('first', start.comment.id);
      const comments = new Y.Map<Y.Map<unknown>>();
      comments.set(start.comment.id, commentMap(start.comment));
      thread.set('comments', comments);
      threads.set(start.id, thread);
    }, origin);
    return true;
  },

  /** Adds a comment to a thread; false when the thread is not there. */
  reply: (doc: Y.Doc, threadId: string, comment: TextDocumentComment, origin: unknown): boolean => {
    const thread = threadsOf(doc).get(threadId);
    const comments = thread && commentsOf(thread);
    if (!comments) return false;
    doc.transact(() => comments.set(comment.id, commentMap(comment)), origin);
    return true;
  },

  /** A comment's new text, its edit's time noted; false when it is not there. */
  edit: (
    doc: Y.Doc,
    threadId: string,
    commentId: string,
    text: string,
    at: number,
    origin: unknown,
  ): boolean => {
    const map = commentAt(doc, threadId, commentId);
    if (!map) return false;
    doc.transact(() => {
      map.set('text', text);
      map.set('edited', at);
    }, origin);
    return true;
  },

  /** Removes a comment; the thread's first comment removes the whole thread. False when it is not there. */
  remove: (doc: Y.Doc, threadId: string, commentId: string, origin: unknown): boolean => {
    const threads = threadsOf(doc);
    const thread = threads.get(threadId);
    const read = thread && readThread(threadId, thread);
    if (!read || !read.comments.some((c) => c.id === commentId)) return false;
    doc.transact(() => {
      if (read.comments[0]!.id === commentId) threads.delete(threadId);
      else commentsOf(thread)!.delete(commentId);
    }, origin);
    return true;
  },

  /** Resolves or reopens a thread; false when it is not there. */
  resolve: (doc: Y.Doc, threadId: string, resolved: boolean, origin: unknown): boolean => {
    const thread = threadsOf(doc).get(threadId);
    if (!thread) return false;
    doc.transact(() => thread.set('resolved', resolved), origin);
    return true;
  },

  /** Adds (`on`) or takes back one reactor's emoji on a comment; false when the comment is not there. */
  react: (
    doc: Y.Doc,
    threadId: string,
    commentId: string,
    { emoji, key, on }: { emoji: string; key: string; on: boolean },
    origin: unknown,
  ): boolean => {
    const map = commentAt(doc, threadId, commentId);
    if (!map) return false;
    doc.transact(() => {
      let reactions = map.get('reactions');
      if (!(reactions instanceof Y.Map)) {
        if (!on) return;
        reactions = new Y.Map<unknown>();
        map.set('reactions', reactions);
      }
      const all = reactions as Y.Map<Y.Map<boolean>>;
      let keys = all.get(emoji);
      if (on) {
        if (!keys) {
          keys = new Y.Map<boolean>();
          all.set(emoji, keys);
        }
        keys.set(key, true);
      } else if (keys) {
        keys.delete(key);
        if (keys.size === 0) all.delete(emoji);
      }
    }, origin);
    return true;
  },
} as const;
