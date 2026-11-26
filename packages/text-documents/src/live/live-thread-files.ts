// A document's comment threads between the model and the live state (docs/specs/034-text-documents/review.md "How a
// comment is kept"): the model marks a thread's stretch in the writing; the live state keeps it beside the writing,
// in `threads`, its edges as positions that follow the text. Written, each marker's place is noted as the writing is
// built and anchored once it is in the document; read, each thread's anchor puts its markers back where it stands.
import * as Y from 'yjs';
import { Comments, type CommentMark, type FileMention, type FileThread } from '../model/comments';
import type { Block } from '../model/blocks';
import { FIRST_DOCUMENT_TAB_ID } from '../model/document-tabs';
import {
  LiveThreads,
  type TextDocumentComment,
  type TextDocumentCommentAuthor,
  type TextDocumentThread,
} from './live-threads';
import { tabFragment } from './live-root';
import { liveTabIds } from './live-tabs';
import { PARAGRAPH } from './live-names';

/** The colour a file's comment author is drawn in: neutral, never a person's (review.md, "From the file"). */
export const FILE_AUTHOR_COLOUR = '#6b7280';

/** A type of the live state a position sits in. */
type LiveType = Y.AbsolutePosition['type'];

type Place = { readonly type: Y.XmlText | Y.XmlElement; readonly index: number };

/** Where each thread's markers sit as the writing is built: its tab, and its start's and end's place. */
export class CommentPlaces {
  /** The document tab whose body is being written. */
  tab: string = FIRST_DOCUMENT_TAB_ID;
  readonly #places = new Map<string, { tab: string; start?: Place; end?: Place }>();

  /** Notes a marker at `index` of `type`; a second start or end of one thread is not noted. */
  note(mark: CommentMark, type: Y.XmlText | Y.XmlElement, index: number): void {
    const held = this.#places.get(mark.id) ?? { tab: this.tab };
    if (held.tab !== this.tab || held[mark.edge]) return;
    this.#places.set(mark.id, { ...held, [mark.edge]: { type, index } });
  }

  /**
   * Each thread whose start was noted, begun in the live state with its comments, anchored where its markers were;
   * its quote the model's, else the text between its markers in `bodies` (by tab). Call once the writing is in `doc`.
   */
  write(
    doc: Y.Doc,
    threads: readonly FileThread[],
    bodies: ReadonlyMap<string, readonly Block[]>,
  ): void {
    const quotes = new Map<string, Map<string, string>>();
    const quoteOf = (tab: string, id: string): string => {
      if (!quotes.has(tab)) quotes.set(tab, Comments.quotes(bodies.get(tab) ?? []));
      return quotes.get(tab)!.get(id) ?? '';
    };
    for (const thread of threads) {
      const place = this.#places.get(thread.id);
      const [first, ...replies] = thread.comments.map(liveComment);
      if (!place?.start || !first) continue;
      const end = place.end ?? place.start;
      LiveThreads.begin(
        doc,
        {
          id: thread.id,
          tab: place.tab,
          start: Y.encodeRelativePosition(
            Y.createRelativePositionFromTypeIndex(place.start.type, place.start.index, 0),
          ),
          end: Y.encodeRelativePosition(
            Y.createRelativePositionFromTypeIndex(end.type, end.index, -1),
          ),
          quote: thread.quote ?? quoteOf(place.tab, thread.id),
          comment: first,
        },
        null,
      );
      for (const reply of replies) LiveThreads.reply(doc, thread.id, reply, null);
      if (thread.resolved) LiveThreads.resolve(doc, thread.id, true, null);
    }
  }
}

/** A model's comment as the live state holds it: one with no key is from the file, drawn in the neutral colour. */
function liveComment(comment: FileThread['comments'][number]): TextDocumentComment {
  const { name, initials, key, colour } = comment.author;
  const author: TextDocumentCommentAuthor =
    key === undefined
      ? { name, ...(initials ? { initials } : {}), colour: FILE_AUTHOR_COLOUR, fromFile: true }
      : { key, name, colour: colour ?? FILE_AUTHOR_COLOUR };
  return {
    id: comment.id,
    text: comment.text,
    at: comment.at ?? 0,
    author,
    ...(comment.reactions ? { reactions: comment.reactions } : {}),
    ...(comment.mentions
      ? { mentions: comment.mentions.map(({ name, handle }) => ({ userId: null, name, handle })) }
      : {}),
  };
}

/** A live comment as the model's: its author's name and a file's initials, or a LiveDoc person's key and colour; a time of 0 is none. */
function fileComment(comment: TextDocumentComment): FileThread['comments'][number] {
  const { name, initials, key, colour } = comment.author;
  return {
    id: comment.id,
    text: comment.text,
    ...(comment.at > 0 ? { at: comment.at } : {}),
    author: key === undefined ? { name, ...(initials ? { initials } : {}) } : { name, key, colour },
    ...(comment.reactions ? { reactions: comment.reactions } : {}),
    ...Comments.mentionsFrom(Comments.mentionsText(fileMentions(comment.mentions))),
  };
}

/** A live comment's mentions as a file keeps them, each with text for its name and handle; others left out. */
function fileMentions(mentions: TextDocumentComment['mentions']): FileMention[] | undefined {
  const kept = (mentions ?? []).filter(
    (m): m is FileMention =>
      typeof m === 'object' &&
      m !== null &&
      typeof (m as FileMention).name === 'string' &&
      typeof (m as FileMention).handle === 'string',
  );
  return kept.length ? kept : undefined;
}

/** The markers to put back, by the type they sit in: each with its index there, in order. */
export type LiveCommentMarks = Map<LiveType, { index: number; mark: CommentMark }[]>;

/** Whether a type is still in the document: neither it nor any type around it deleted. */
function attached(type: LiveType): boolean {
  for (let t: LiveType | null = type; t?._item; t = t._item.parent as LiveType)
    if (t._item.deleted) return false;
  return true;
}

/** The first paragraph of a tab's body, where a thread whose stretch is lost is written as a point. */
function firstParagraph(doc: Y.Doc, tab: string): Y.XmlElement | undefined {
  if (!liveTabIds(doc).includes(tab)) return undefined;
  return tabFragment(doc, tab)
    .toArray()
    .find((n): n is Y.XmlElement => n instanceof Y.XmlElement && n.nodeName === PARAGRAPH);
}

/**
 * The live threads as the model's, and their markers by where they go: a thread at its stretch; a deleted one (its
 * quote's text all gone) as a point where its stretch was; one whose stretch no longer stands as a point at the start
 * of its tab; one whose tab is gone, not at all.
 */
export function readLiveComments(doc: Y.Doc): { threads: FileThread[]; marks: LiveCommentMarks } {
  const marks: LiveCommentMarks = new Map();
  const put = (type: LiveType, index: number, mark: CommentMark) => {
    const list = marks.get(type) ?? [];
    list.push({ index, mark });
    marks.set(type, list);
  };
  const threads: FileThread[] = [];
  for (const thread of LiveThreads.read(doc)) {
    const at = placeOf(doc, thread);
    if (!at) continue;
    // The quote travels only for a deleted stretch: elsewhere it is the text between the markers.
    const deleted = at.start === at.end && thread.quote !== '';
    const mark = (edge: CommentMark['edge']): CommentMark => ({
      type: 'comment',
      edge,
      id: thread.id,
      props: {},
    });
    put(at.start.type, at.start.index, mark('start'));
    put(at.end.type, at.end.index, mark('end'));
    threads.push({
      id: thread.id,
      resolved: thread.resolved,
      ...(deleted ? { quote: thread.quote } : {}),
      comments: thread.comments.map(fileComment),
    });
  }
  for (const list of marks.values()) list.sort((a, b) => a.index - b.index);
  return { threads, marks };
}

function placeOf(
  doc: Y.Doc,
  thread: TextDocumentThread,
): {
  start: { type: LiveType; index: number };
  end: { type: LiveType; index: number };
} | null {
  const anchor = LiveThreads.anchor(doc, thread);
  const start = anchor && attached(anchor.start.type) ? anchor.start : null;
  if (!start) {
    const paragraph = firstParagraph(doc, thread.tab);
    const here = paragraph && { type: paragraph, index: 0 };
    return here ? { start: here, end: here } : null;
  }
  const end = anchor && attached(anchor.end.type) && !anchor.deleted ? anchor.end : null;
  const backwards = end !== null && end.type === start.type && end.index < start.index;
  return { start, end: end && !backwards ? end : start };
}
