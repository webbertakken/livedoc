// Comments in an ODF file (docs/specs/034-text-documents/review.md "How a comment is kept", standard-mapping.md
// "Comments"): an `office:annotation` starts a comment's stretch and holds its author, date and paragraphs, its
// `office:annotation-end` of the same `office:name` ends it; an annotation with no name is a point. LibreOffice's
// `loext:parent-name` makes an annotation a reply in its parent's thread, and `loext:resolved` resolves one.
import {
  attributeOf,
  childElements,
  escapeXmlAttribute,
  escapeXmlText,
  type XmlElement,
  type XmlNode,
} from '@livedoc/office-packages';
import { Comments, type CommentMark, type FileComment, type FileThread } from '../model/comments';
import type { ReportBuilder } from '../report';
import { LIVEDOC_NS, NS } from './odf-names';
import { initialsOf } from '../ooxml/ooxml-comments';

type MarkAt = Omit<CommentMark, 'type' | 'edge' | 'id'>;

/** An annotation paragraph's text: its characters, spaces, tabs and line breaks. */
function paragraphText(p: XmlElement): string {
  let text = '';
  const walk = (node: XmlNode): void => {
    if (typeof node === 'string') {
      text += node.replace(/[ \t\r\n]+/g, ' ');
      return;
    }
    if (node.uri === NS.text && node.local === 's')
      text += ' '.repeat(Math.max(1, Number(attributeOf(node, NS.text, 'c') ?? '1') || 1));
    else if (node.uri === NS.text && node.local === 'tab') text += '\t';
    else if (node.uri === NS.text && node.local === 'line-break') text += '\n';
    else for (const child of node.children) walk(child);
  };
  for (const child of p.children) walk(child);
  return text.trim();
}

const textOf = (e: XmlElement | undefined): string | undefined => {
  if (!e) return undefined;
  const text = e.children.filter((c): c is string => typeof c === 'string').join('');
  return text.trim() || undefined;
};

/** The paragraphs an annotation holds, those of its lists too. */
function paragraphsOf(e: XmlElement): XmlElement[] {
  return childElements(e).flatMap((c) =>
    c.uri === NS.text && (c.local === 'p' || c.local === 'h')
      ? [c]
      : c.uri === NS.text && (c.local === 'list' || c.local === 'list-item')
        ? paragraphsOf(c)
        : [],
  );
}

/** The annotations of a document's writing, read in its order. */
export class OdfCommentsReader {
  readonly #threads = new Map<string, { resolved: boolean; comments: FileComment[] }>();
  /** Each annotation name, by the thread it begins or joins. */
  readonly #threadOfName = new Map<string, string>();
  /** The names of replies, whose ends are read as nothing. */
  readonly #replyNames = new Set<string>();
  #count = 0;
  readonly #report: ReportBuilder;

  constructor(report: ReportBuilder) {
    this.#report = report;
  }

  threads(): FileThread[] {
    return [...this.#threads].map(([id, t]) => ({
      id,
      resolved: t.resolved,
      comments: t.comments,
    }));
  }

  /** An `office:annotation` as its thread's start marker, or none: a reply joins its thread; one in a story is dropped. */
  annotation(e: XmlElement, inBody: boolean, place: MarkAt): CommentMark | null {
    if (!inBody) {
      this.#report.drop('comment-in-story', 'comment marker');
      return null;
    }
    const name = attributeOf(e, NS.office, 'name');
    const n = this.#count++;
    const at = Comments.timeOf(
      textOf(childElements(e).find((c) => c.uri === NS.dc && c.local === 'date')),
    );
    const initials = textOf(
      childElements(e).find((c) => c.uri === NS.meta && c.local === 'creator-initials'),
    );
    const comment: FileComment = {
      id: '',
      text: paragraphsOf(e).map(paragraphText).join('\n'),
      ...(at !== undefined ? { at } : {}),
      author: {
        name: textOf(childElements(e).find((c) => c.uri === NS.dc && c.local === 'creator')) ?? '',
        ...(initials ? { initials } : {}),
      },
      ...Comments.reactionsFrom(attributeOf(e, LIVEDOC_NS, 'reactions')),
      ...Comments.mentionsFrom(attributeOf(e, LIVEDOC_NS, 'mentions')),
      ...Comments.assigneeFrom(attributeOf(e, LIVEDOC_NS, 'assignee')),
    };
    const parent = attributeOf(e, NS.loext, 'parent-name');
    const joins = parent === undefined ? undefined : this.#threadOfName.get(parent);
    if (joins !== undefined) {
      const thread = this.#threads.get(joins)!;
      // A reply's id is its place in its thread, which the writer keeps; ODF names no reply for good.
      thread.comments.push({ ...comment, id: `${joins}.${thread.comments.length}` });
      if (name !== undefined) {
        this.#threadOfName.set(name, joins);
        this.#replyNames.add(name);
      }
      return null;
    }
    const id = name !== undefined && !this.#threads.has(`f.${name}`) ? `f.${name}` : `f.a${n}`;
    this.#threads.set(id, {
      resolved: attributeOf(e, NS.loext, 'resolved') === 'true',
      comments: [{ ...comment, id }],
    });
    if (name !== undefined) this.#threadOfName.set(name, id);
    return { type: 'comment', edge: 'start', id, ...place };
  }

  /** An `office:annotation-end` as its thread's end marker, or none: a reply's, or one in a story. */
  end(e: XmlElement, inBody: boolean, at: MarkAt): CommentMark | null {
    const name = attributeOf(e, NS.office, 'name');
    if (name === undefined || this.#replyNames.has(name)) return null;
    if (!inBody) {
      this.#report.drop('comment-in-story', 'comment marker');
      return null;
    }
    return { type: 'comment', edge: 'end', id: this.#threadOfName.get(name) ?? `f.${name}`, ...at };
  }
}

const LOEXT = `xmlns:loext="${NS.loext}"`;

/**
 * The names the threads' annotations are written with, by thread: one read from an ODF file keeps its name, so a file
 * written back reads the same; the rest are `__Annotation__<n>`, as LibreOffice names its own, never one taken.
 */
export function odfAnnotationNames(threads: readonly FileThread[]): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();
  for (const t of threads) {
    const own = t.id.startsWith('f.') ? t.id.slice(2) : '';
    if (own && !/\s/.test(own) && !taken.has(own)) {
      names.set(t.id, own);
      taken.add(own);
    }
  }
  let n = 0;
  for (const t of threads) {
    if (names.has(t.id)) continue;
    while (taken.has(`__Annotation__${n}`)) n += 1;
    names.set(t.id, `__Annotation__${n}`);
    taken.add(`__Annotation__${n}`);
  }
  return names;
}

function annotationXml(comment: FileComment, attributes: string): string {
  const initials = initialsOf(comment);
  const date =
    comment.at === undefined
      ? ''
      : `<dc:date>${new Date(comment.at).toISOString().replace(/Z$/, '')}</dc:date>`;
  const paragraphs = Comments.lines(comment.text)
    .map((line) => `<text:p>${escapeXmlText(line)}</text:p>`)
    .join('');
  const reactions = Comments.reactionsText(comment.reactions);
  const mentions = Comments.mentionsText(comment.mentions);
  const assignee = Comments.assigneeText(comment.assignee);
  const extended =
    (reactions ? ` livedoc:reactions="${escapeXmlAttribute(reactions)}"` : '') +
    (mentions ? ` livedoc:mentions="${escapeXmlAttribute(mentions)}"` : '') +
    (assignee ? ` livedoc:assignee="${escapeXmlAttribute(assignee)}"` : '');
  const reacted = extended ? ` xmlns:livedoc="${LIVEDOC_NS}"${extended}` : '';
  return `<office:annotation${attributes}${reacted}><dc:creator>${escapeXmlText(comment.author.name)}</dc:creator>${date}${initials ? `<meta:creator-initials>${escapeXmlText(initials)}</meta:creator-initials>` : ''}${paragraphs}</office:annotation>`;
}

/** A thread's start: its first comment's annotation, named `name`, then each reply's, naming it as its parent. */
export function odfThreadStartXml(thread: FileThread, name: string): string {
  const [first, ...replies] = thread.comments;
  if (!first) return '';
  const head = annotationXml(
    first,
    ` office:name="${escapeXmlAttribute(name)}" ${LOEXT} loext:resolved="${thread.resolved}"`,
  );
  return (
    head +
    replies
      .map((reply) =>
        annotationXml(reply, ` ${LOEXT} loext:parent-name="${escapeXmlAttribute(name)}"`),
      )
      .join('')
  );
}

/** A thread's end. */
export const odfThreadEndXml = (name: string): string =>
  `<office:annotation-end office:name="${escapeXmlAttribute(name)}"/>`;
