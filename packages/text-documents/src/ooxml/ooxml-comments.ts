// Comments in a Word file (docs/specs/034-text-documents/review.md "How a comment is kept", standard-mapping.md
// "Comments"): `w:commentRangeStart` and `-End` mark a comment's stretch in the writing and a `w:commentReference` run
// follows its end; `comments.xml` holds each comment, `commentsExtended.xml` which comment replies to which (by its
// last paragraph's `w14:paraId`) and which are done. A thread is its first comment's range; a reply's own range,
// which Word writes at its thread's, is read as nothing. A reference with no range before it is a point.
import {
  attributeOf,
  childElements,
  escapeXmlAttribute,
  escapeXmlText,
  RELATIONSHIP_TYPES,
  textContent,
  type XmlElement,
} from '@livedoc/office-packages';
import { Comments, type CommentMark, type FileComment, type FileThread } from '../model/comments';
import type { ReportBuilder } from '../report';
import { LIVEDOC_NS } from '../odf/odf-names';
import { MC_NS, W_NS, XML_HEAD } from './ooxml-names';

/** The comments parts' relationships: the parts are written fresh from the threads, so these are never kept. */
export const COMMENT_RELATIONSHIPS: ReadonlySet<string> = new Set<string>([
  RELATIONSHIP_TYPES.comments,
  RELATIONSHIP_TYPES.commentsExtended,
  RELATIONSHIP_TYPES.commentsIds,
  RELATIONSHIP_TYPES.commentsExtensible,
]);

export const W14_NS = 'http://schemas.microsoft.com/office/word/2010/wordml';
export const W15_NS = 'http://schemas.microsoft.com/office/word/2012/wordml';

/** A file's thread and comment ids: its first comment's `w:id`, and each comment's. */
const idOf = (wId: string): string => `f.${wId}`;

const isW = (e: XmlElement, local: string) => e.uri === W_NS && e.local === local;

/** A comment paragraph's text: its runs' text, tabs and breaks. */
function paragraphText(p: XmlElement): string {
  let text = '';
  const walk = (e: XmlElement): void => {
    for (const c of childElements(e))
      if (isW(c, 't')) text += textContent(c);
      else if (isW(c, 'tab')) text += '\t';
      else if (isW(c, 'br') || isW(c, 'cr')) text += '\n';
      else if (!isW(c, 'rPr') && !isW(c, 'pPr')) walk(c);
  };
  walk(p);
  return text;
}

/** The comments of `comments.xml`, threaded by `commentsExtended.xml`. */
export class OoxmlCommentsReader {
  /** Each thread, its first comment's `w:id` its key, in the order of the comments part. */
  readonly #threads = new Map<string, { resolved: boolean; comments: FileComment[] }>();
  /** Each reply's `w:id`. */
  readonly #replies = new Set<string>();
  /** The threads whose stretch a range has started. */
  readonly #started = new Set<string>();
  readonly #report: ReportBuilder;

  constructor(
    comments: XmlElement | undefined,
    extended: XmlElement | undefined,
    report: ReportBuilder,
  ) {
    this.#report = report;
    const ex = new Map<string, { parent?: string; done: boolean }>();
    for (const e of extended ? childElements(extended) : [])
      if (e.uri === W15_NS && e.local === 'commentEx') {
        const paraId = attributeOf(e, W15_NS, 'paraId');
        const parent = attributeOf(e, W15_NS, 'paraIdParent');
        if (paraId)
          ex.set(paraId.toUpperCase(), {
            ...(parent ? { parent: parent.toUpperCase() } : {}),
            done: attributeOf(e, W15_NS, 'done') === '1',
          });
      }
    // The thread each comment's last paragraph begins or joins.
    const threadOfPara = new Map<string, string>();
    for (const c of comments ? childElements(comments) : []) {
      if (!isW(c, 'comment')) continue;
      const wId = attributeOf(c, W_NS, 'id');
      if (wId === undefined || this.#threads.has(wId) || this.#replies.has(wId)) continue;
      const paragraphs = childElements(c).filter((p) => isW(p, 'p'));
      const paraId = paragraphs.at(-1) && attributeOf(paragraphs.at(-1)!, W14_NS, 'paraId');
      const initials = attributeOf(c, W_NS, 'initials');
      const at = Comments.timeOf(attributeOf(c, W_NS, 'date'));
      const comment: FileComment = {
        id: idOf(wId),
        text: paragraphs.map(paragraphText).join('\n'),
        ...(at !== undefined ? { at } : {}),
        author: {
          name: attributeOf(c, W_NS, 'author') ?? '',
          ...(initials ? { initials } : {}),
        },
        ...Comments.reactionsFrom(attributeOf(c, LIVEDOC_NS, 'reactions')),
      };
      const info = paraId ? ex.get(paraId.toUpperCase()) : undefined;
      const parentThread = info?.parent ? threadOfPara.get(info.parent) : undefined;
      if (parentThread !== undefined) {
        this.#threads.get(parentThread)!.comments.push(comment);
        this.#replies.add(wId);
        if (paraId) threadOfPara.set(paraId.toUpperCase(), parentThread);
        continue;
      }
      this.#threads.set(wId, { resolved: info?.done === true, comments: [comment] });
      if (paraId) threadOfPara.set(paraId.toUpperCase(), wId);
    }
  }

  /** The threads read, for the document beside its writing. */
  threads(): FileThread[] {
    return [...this.#threads].map(([wId, t]) => ({
      id: idOf(wId),
      resolved: t.resolved,
      comments: t.comments,
    }));
  }

  /**
   * A range's start or end (`w:commentRangeStart`, `-End`) as a marker, or none: a reply's, read as nothing; one in a
   * header, footer or note, dropped and reported.
   */
  range(
    e: XmlElement,
    inStory: boolean,
    at: Omit<CommentMark, 'type' | 'edge' | 'id'>,
  ): CommentMark | null {
    const wId = attributeOf(e, W_NS, 'id');
    if (wId === undefined || this.#replies.has(wId)) return null;
    if (inStory) {
      this.#report.drop('comment-in-story', 'comment marker');
      return null;
    }
    const edge = e.local === 'commentRangeStart' ? 'start' : 'end';
    if (edge === 'start') this.#started.add(wId);
    return { type: 'comment', edge, id: idOf(wId), ...at };
  }

  /** A `w:commentReference` with no range started before it: a point comment's start; else nothing. */
  reference(
    e: XmlElement,
    inStory: boolean,
    at: Omit<CommentMark, 'type' | 'edge' | 'id'>,
  ): CommentMark | null {
    const wId = attributeOf(e, W_NS, 'id');
    if (wId === undefined || this.#replies.has(wId) || this.#started.has(wId)) return null;
    if (inStory) {
      this.#report.drop('comment-in-story', 'comment marker');
      return null;
    }
    this.#started.add(wId);
    return { type: 'comment', edge: 'start', id: idOf(wId), ...at };
  }
}

/** The `w14:paraId` of the `n`th comment paragraph written: 8 hex digits below 0x80000000, as Word asks. */
const paraIdOf = (n: number): string =>
  (0x7c000000 + n).toString(16).toUpperCase().padStart(8, '0');

/** A comment's initials: the file's, or a LiveDoc person's made from their name; none for a file's that had none. */
export const initialsOf = (comment: FileComment): string | undefined =>
  comment.author.initials ??
  (comment.author.key === undefined ? undefined : Comments.initials(comment.author.name));

const dateOf = (at: number): string => new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Each thread's comments numbered as the writer writes their `w:id`s: a comment read from a Word file keeps its number
 * where it is free and past `after` (kept content's), so a file written back reads the same; the rest are numbered
 * after the highest, in thread order.
 */
export function ooxmlCommentIds(
  threads: readonly FileThread[],
  after: number,
): Map<string, number[]> {
  const taken = new Set<number>();
  const own = threads.map((t) =>
    t.comments.map((c) => {
      const n = /^f\.(\d+)$/.test(c.id) ? Number(c.id.slice(2)) : NaN;
      if (!Number.isSafeInteger(n) || n <= after || taken.has(n)) return undefined;
      taken.add(n);
      return n;
    }),
  );
  let next = Math.max(after, ...taken);
  return new Map(threads.map((t, i) => [t.id, own[i]!.map((n) => n ?? ++next)]));
}

/** The writing's marks of a thread's edge: each of its comments' range edge, and after the end each one's reference. */
export function ooxmlCommentMarkXml(edge: CommentMark['edge'], ids: readonly number[]): string {
  if (edge === 'start') return ids.map((n) => `<w:commentRangeStart w:id="${n}"/>`).join('');
  return ids
    .map((n) => `<w:commentRangeEnd w:id="${n}"/><w:r><w:commentReference w:id="${n}"/></w:r>`)
    .join('');
}

/** `comments.xml` and `commentsExtended.xml` for the threads, numbered by `ids`. */
export function ooxmlCommentsXml(
  threads: readonly FileThread[],
  ids: ReadonlyMap<string, readonly number[]>,
): { comments: string; extended: string } {
  let paragraph = 0;
  const comments: string[] = [];
  const extended: string[] = [];
  for (const thread of threads) {
    const numbers = ids.get(thread.id) ?? [];
    let first: string | undefined;
    thread.comments.forEach((comment, i) => {
      const n = numbers[i];
      if (n === undefined) return;
      const lines = Comments.lines(comment.text);
      const paras = lines.map((line, at) => {
        const paraId = paraIdOf(paragraph++);
        const lead = at === 0 ? '<w:r><w:annotationRef/></w:r>' : '';
        const text = line
          ? `<w:r><w:t xml:space="preserve">${escapeXmlText(line)}</w:t></w:r>`
          : '';
        return {
          paraId,
          xml: `<w:p w14:paraId="${paraId}" w14:textId="77777777">${lead}${text}</w:p>`,
        };
      });
      const last = paras.at(-1)!.paraId;
      first ??= last;
      const initials = initialsOf(comment);
      const date = comment.at === undefined ? '' : ` w:date="${dateOf(comment.at)}"`;
      const reactions = Comments.reactionsText(comment.reactions);
      const reacted = reactions ? ` livedoc:reactions="${escapeXmlAttribute(reactions)}"` : '';
      comments.push(
        `<w:comment w:id="${n}" w:author="${escapeXmlAttribute(comment.author.name)}"${date}${initials ? ` w:initials="${escapeXmlAttribute(initials)}"` : ''}${reacted}>${paras.map((p) => p.xml).join('')}</w:comment>`,
      );
      const parent = i > 0 ? ` w15:paraIdParent="${first}"` : '';
      extended.push(
        `<w15:commentEx w15:paraId="${last}"${parent} w15:done="${thread.resolved ? 1 : 0}"/>`,
      );
    });
  }
  return {
    comments: `${XML_HEAD}<w:comments xmlns:w="${W_NS}" xmlns:w14="${W14_NS}" xmlns:mc="${MC_NS}" xmlns:livedoc="${LIVEDOC_NS}" mc:Ignorable="w14 livedoc">${comments.join('')}</w:comments>\n`,
    extended: `${XML_HEAD}<w15:commentsEx xmlns:w15="${W15_NS}">${extended.join('')}</w15:commentsEx>\n`,
  };
}

/** The highest comment id kept content holds, so the comments written are numbered after it. */
export function keptCommentIds(keptXml: Iterable<string>): number {
  let most = -1;
  for (const xml of keptXml)
    for (const match of xml.matchAll(
      /comment(?:RangeStart|RangeEnd|Reference)\b[^>]*?\sw:id="(\d+)"/g,
    ))
      most = Math.max(most, Number(match[1]));
  return most;
}
