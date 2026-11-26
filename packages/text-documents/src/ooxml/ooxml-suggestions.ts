// Word's tracked changes as suggestions (docs/specs/034-text-documents/review.md "How a suggestion is kept", "In the
// files"; ECMA-376 Part 1 §17.13.5): runs inside `w:ins` / `w:del` (`w:moveTo` / `w:moveFrom` read as them), a run's
// `w:rPrChange`, a paragraph's `w:pPrChange`, and a paragraph mark's `w:ins` / `w:del`, which Word puts on the
// paragraph BEFORE the break while the model puts the break on the paragraph after it. Each element's own suggestion
// id travels as `livedoc:id`, so one suggestion written as several elements reads back as one.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  keptXmlOf,
  serializeXml,
  type KeptXml,
  type XmlElement,
  type XmlParsed,
} from '@livedoc/office-packages';
import { Comments } from '../model/comments';
import {
  Suggestions,
  type FileSuggestionMark,
  type InlineSuggested,
  type ParagraphSuggested,
} from '../model/suggestions';
import { LIVEDOC_NS } from '../odf/odf-names';
import { W_NS } from './ooxml-names';

/** A paragraph's children whose runs are inserted or deleted. */
const INSERTED = new Set(['ins', 'moveTo']);
const DELETED = new Set(['del', 'moveFrom']);
export const isRevisionRuns = (e: XmlElement): boolean =>
  e.uri === W_NS && (INSERTED.has(e.local) || DELETED.has(e.local));

/** The revision children a `w:rPr` or `w:pPr` holds that the model reads apart, never kept. */
const PROPERTY_REVISIONS = new Set(['rPrChange', 'pPrChange', 'ins', 'del', 'moveFrom', 'moveTo']);

const wAttr = (e: XmlElement, name: string) => attributeOf(e, W_NS, name);

/** A tracked change's mark: its own LiveDoc id, else `f.<w:id>`; its date and its author's name. */
export function ooxmlSuggestionMark(e: XmlElement): FileSuggestionMark {
  const own = attributeOf(e, LIVEDOC_NS, 'id');
  const at = Comments.timeOf(wAttr(e, 'date'));
  return {
    id: own && own.length <= 64 ? own : `f.${wAttr(e, 'id') ?? e.start}`,
    ...(at === undefined ? {} : { at }),
    author: Suggestions.authorOf(wAttr(e, 'author')),
  };
}

/** The suggestion a `w:ins` / `w:del` (or a move) gives the runs inside it. */
export function revisionRunsSuggested(e: XmlElement): InlineSuggested {
  const mark = ooxmlSuggestionMark(e);
  return INSERTED.has(e.local) ? { insertion: mark } : { deletion: mark };
}

/** A `w:rPr`'s `w:rPrChange`: its mark and the run properties inside it, as `read` reads them. */
export function readRunChange<T>(
  rPr: XmlElement | undefined,
  read: (before: XmlElement | undefined) => T,
): (FileSuggestionMark & { before: T }) | undefined {
  const change = rPr && childElement(rPr, W_NS, 'rPrChange');
  if (!change) return undefined;
  return { ...ooxmlSuggestionMark(change), before: read(childElement(change, W_NS, 'rPr')) };
}

/** A `w:pPr`'s `w:pPrChange`: its mark and the paragraph properties inside it, as `read` reads them. */
export function readParagraphChange<T>(
  pPr: XmlElement | undefined,
  read: (before: XmlElement | undefined) => T,
): (FileSuggestionMark & { before: T }) | undefined {
  const change = pPr && childElement(pPr, W_NS, 'pPrChange');
  if (!change) return undefined;
  return { ...ooxmlSuggestionMark(change), before: read(childElement(change, W_NS, 'pPr')) };
}

/** A paragraph mark's tracked change, as the NEXT paragraph's break (inserted) or join (deleted). */
export function readParagraphMark(pPr: XmlElement | undefined): ParagraphSuggested | undefined {
  const rPr = pPr && childElement(pPr, W_NS, 'rPr');
  const change = rPr && childElements(rPr).find(isRevisionRuns);
  if (!change) return undefined;
  const mark = ooxmlSuggestionMark(change);
  return INSERTED.has(change.local) ? { break: mark } : { join: mark };
}

/** Whether a property element holds a revision the model reads apart, at any depth of its `w:rPr`. */
const holdsRevision = (e: XmlElement): boolean =>
  childElements(e).some(
    (c) =>
      c.uri === W_NS &&
      (PROPERTY_REVISIONS.has(c.local) || (c.local === 'rPr' && holdsRevision(c))),
  );

/** A `w:rPr` or `w:pPr` (or a child of one) kept without the revisions the model reads apart. */
export function keptWithoutRevisions(parsed: XmlParsed, e: XmlElement): KeptXml {
  if (!holdsRevision(e)) return keptXmlOf(parsed, e);
  const omit = (x: XmlElement) => x !== e && x.uri === W_NS && PROPERTY_REVISIONS.has(x.local);
  return { xml: serializeXml(e, omit), ns: keptXmlOf(parsed, e).ns };
}

/** Whether a property child is a revision the model reads apart (never kept as residue). */
export const isPropertyRevision = (e: XmlElement): boolean =>
  e.uri === W_NS && (e.local === 'rPrChange' || e.local === 'pPrChange');

// ---- Writing ----

const isoOf = (at: number | undefined): string | undefined =>
  at === undefined ? undefined : new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Numbers each written tracked change: a file's `f.<n>` keeps its number where free, others after the highest. */
export class OoxmlRevisionIds {
  readonly #used = new Set<number>();
  #next = 1;

  constructor(marks: Iterable<FileSuggestionMark>) {
    for (const mark of marks) {
      const n = /^f\.(\d+)$/.exec(mark.id)?.[1];
      if (n !== undefined) this.#next = Math.max(this.#next, Number(n) + 1);
    }
  }

  /** A fresh w:id for one element of `mark`. */
  idFor(mark: FileSuggestionMark): number {
    const n = /^f\.(\d+)$/.exec(mark.id)?.[1];
    if (n !== undefined && !this.#used.has(Number(n))) {
      this.#used.add(Number(n));
      return Number(n);
    }
    while (this.#used.has(this.#next)) this.#next += 1;
    this.#used.add(this.#next);
    return this.#next++;
  }
}

/** A tracked change element's attributes for `mark`. */
export function revisionAttributes(mark: FileSuggestionMark, ids: OoxmlRevisionIds): string {
  const date = isoOf(mark.at);
  const own = /^f\.\d+$/.test(mark.id) ? '' : ` livedoc:id="${escapeXmlAttribute(mark.id)}"`;
  return `w:id="${ids.idFor(mark)}" w:author="${escapeXmlAttribute(mark.author.name)}"${date ? ` w:date="${date}"` : ''}${own}`;
}

/** Runs' XML as deleted text: `w:t` as `w:delText`, `w:instrText` as `w:delInstrText`. */
export const asDeletedRuns = (xml: string): string =>
  xml
    .replace(/<(\/?)w:t(?=[\s>/])/g, '<$1w:delText')
    .replace(/<(\/?)w:instrText(?=[\s>/])/g, '<$1w:delInstrText');

/** Pieces of a paragraph wrapped in `w:ins` / `w:del` where they are part of a suggestion, one per stretch. */
export function wrapRevisions(
  pieces: readonly { xml: string; suggested?: InlineSuggested }[],
  ids: OoxmlRevisionIds,
): string {
  let out = '';
  for (let i = 0; i < pieces.length;) {
    const { insertion, deletion } = pieces[i]!.suggested ?? {};
    let j = i;
    let xml = '';
    while (
      j < pieces.length &&
      pieces[j]!.suggested?.insertion?.id === insertion?.id &&
      pieces[j]!.suggested?.deletion?.id === deletion?.id
    )
      xml += pieces[j++]!.xml;
    if (deletion) xml = `<w:del ${revisionAttributes(deletion, ids)}>${asDeletedRuns(xml)}</w:del>`;
    if (insertion) xml = `<w:ins ${revisionAttributes(insertion, ids)}>${xml}</w:ins>`;
    out += xml;
    i = j;
  }
  return out;
}

/** A `w:rPrChange` holding the run properties before (their children, written by the caller). */
export const runChangeXml = (
  mark: FileSuggestionMark,
  before: string,
  ids: OoxmlRevisionIds,
): string => `<w:rPrChange ${revisionAttributes(mark, ids)}><w:rPr>${before}</w:rPr></w:rPrChange>`;

/** A `w:pPrChange` holding the paragraph properties before (their children, written by the caller). */
export const paragraphChangeXml = (
  mark: FileSuggestionMark,
  before: string,
  ids: OoxmlRevisionIds,
): string => `<w:pPrChange ${revisionAttributes(mark, ids)}><w:pPr>${before}</w:pPr></w:pPrChange>`;

/** A paragraph mark's tracked change (the next paragraph's break or join), as the first child of its `w:rPr`. */
export const paragraphMarkXml = (marked: ParagraphSuggested, ids: OoxmlRevisionIds): string =>
  (marked.break ? `<w:ins ${revisionAttributes(marked.break, ids)}/>` : '') +
  (marked.join ? `<w:del ${revisionAttributes(marked.join, ids)}/>` : '');

/** A kept paragraph mark `w:rPr` with `marks` put first inside it, or a new one holding only them. */
export function withParagraphMark(rPr: string | undefined, marks: string): string {
  if (rPr === undefined) return `<w:rPr>${marks}</w:rPr>`;
  const selfClosed = /^<((?:[\w.-]+:)?rPr)(\b[^>]*?)\/>$/.exec(rPr);
  if (selfClosed) return `<${selfClosed[1]}${selfClosed[2]}>${marks}</${selfClosed[1]}>`;
  return rPr.replace(/^<(?:[\w.-]+:)?rPr\b[^>]*>/, (open) => `${open}${marks}`);
}
