// Suggestions in the live state (docs/specs/034-text-documents/review.md "How a suggestion is kept"): kept in the
// writing where they stand, as marks on text (`insertion`, `deletion`, `format_change`), as the same attributes on an
// object in a line or a whole block, and on a paragraph as its break (`insertion`), its join (`deletion`) or its
// paragraph format (`formatChange`). A suggestion is every part with one id. Read, accepted and rejected here; the
// room's judge reads the writing with one person's suggestions rejected (`ownRejected`).
import * as Y from 'yjs';
import {
  DELETION_MARK,
  FORMAT_CHANGE_MARK,
  INSERTION_MARK,
  PARAGRAPH,
  PARAGRAPH_FORMAT_CHANGE,
  PICTURE,
  SUGGESTION_MARKS,
  TABLE,
  TABLE_CELL,
  TABLE_HEADER,
} from './live-names';
import { liveWritings } from './live-stories';
import { fitTableWidth } from './live-table-fit';
import { shrinkCrossingSpans } from './live-table-spans';
import {
  deltaOf,
  elementsOf,
  emptiedContainer,
  isEmpty,
  isObject,
  isSuggestionMark,
  type FormatChangeMark,
  type ParagraphFormatChangeMark,
  type SuggestionMark,
} from './live-suggestion-marks';
import { ownBy, ownMarksWellFormed, ownRejected } from './live-suggestions-own';

export {
  DELETION_MARK,
  FORMAT_CHANGE_MARK,
  INSERTION_MARK,
  PARAGRAPH_FORMAT_CHANGE,
  SUGGESTION_MARKS,
};
export {
  isSuggestionMark,
  isWellFormedMark,
  SUGGESTION_AUTHOR_NAME_MAX,
  SUGGESTION_ID_MAX,
  TEXT_DOCUMENT_SUGGESTIONS_MAX,
  type FormatChangeMark,
  type ParagraphFormatChangeMark,
  type SuggestionMark,
} from './live-suggestion-marks';

export type SuggestionPartKind =
  | 'insertion'
  | 'deletion'
  | 'format'
  | 'break'
  | 'join'
  | 'paragraph-format'
  | 'block-insertion'
  | 'block-deletion';

/** What a picture that shows a drawing reads as in a suggestion's part (review.md "Drawings"). */
export const DRAWING_ELEMENT = 'drawing';

/** An object's or a block's name in a suggestion's part: its element's, a drawing's picture a drawing. */
function elementOf(node: Y.XmlElement): string {
  const drawing = node.nodeName === PICTURE ? node.getAttribute('drawing') : undefined;
  return typeof drawing === 'string' && drawing ? DRAWING_ELEMENT : node.nodeName;
}

/** One stretch or element of a suggestion: its kind, its text (an object's or a block's: its element's name). */
export type SuggestionPart = {
  readonly kind: SuggestionPartKind;
  readonly text: string;
  /** A format part: the text formatting attributes it changed, as its marks' `before` name them. */
  readonly changed?: readonly string[];
  /** An object's or a block's part: its element's name, `drawing` for a picture that shows a drawing. */
  readonly element?: string;
  /** A break part: the break its paragraph starts with, where it is more than a paragraph break. */
  readonly breakKind?: SuggestedBreakKind;
};

/** What a suggested paragraph break puts in, beyond a paragraph: a page break, a column break, a horizontal line. */
export type SuggestedBreakKind = 'page' | 'column' | 'horizontal-line';

/**
 * The break a paragraph carrying a suggested break starts with, by its own formatting: a page or a column break before
 * it, else a horizontal line where it is empty with a bottom border (review.md "Breaks and lines"); none otherwise.
 */
export function suggestedBreakKind(props: unknown, empty: boolean): SuggestedBreakKind | undefined {
  if (!isObject(props)) return undefined;
  if (props.pageBreakBefore === true) return 'page';
  if (props.columnBreakBefore === true) return 'column';
  const borders = props.borders;
  if (empty && isObject(borders) && isObject(borders.bottom)) return 'horizontal-line';
  return undefined;
}

type ReadPart = {
  kind: SuggestionPartKind;
  text: string;
  changed?: string[];
  element?: string;
  breakKind?: SuggestedBreakKind;
};

export type TextDocumentSuggestion = SuggestionMark & {
  /** The document tab its first part is in, or the tab that shows the story it is in. */
  readonly tab: string;
  /** The story (a header's, footer's or note's fragment id) its first part is in; none in a tab's body. */
  readonly story?: string;
  readonly parts: readonly SuggestionPart[];
};

/** The text formatting attributes a format mark's `before` names. */
const changedOf = (value: unknown): string[] => {
  const before = isObject(value) ? value.before : undefined;
  return isObject(before) ? Object.keys(before) : [];
};

const marksOf = (value: unknown, ids: ReadonlySet<string>): boolean =>
  isSuggestionMark(value) && ids.has(value.id);

const TEXT_KINDS: readonly [string, SuggestionPartKind][] = [
  [INSERTION_MARK, 'insertion'],
  [DELETION_MARK, 'deletion'],
  [FORMAT_CHANGE_MARK, 'format'],
];

/**
 * The document's suggestions, in the tabs' order and the writing's, each tab's body before the stories it shows, each
 * with its parts.
 */
function read(doc: Y.Doc): TextDocumentSuggestion[] {
  const found = new Map<
    string,
    { mark: SuggestionMark; tab: string; story?: string; parts: ReadPart[] }
  >();
  let last: ReadPart | null = null;
  // The writing being walked.
  let where: { tab: string; story?: string } = { tab: '' };
  const add = (
    value: unknown,
    kind: SuggestionPartKind,
    text: string,
    element?: string,
    breakKind?: SuggestedBreakKind,
  ) => {
    if (!isSuggestionMark(value)) return;
    let entry = found.get(value.id);
    if (!entry) {
      entry = { mark: value, ...where, parts: [] };
      found.set(value.id, entry);
    }
    const previous = entry.parts.at(-1);
    if (
      previous &&
      previous === last &&
      previous.kind === kind &&
      kind !== 'break' &&
      kind !== 'join' &&
      element === undefined &&
      previous.element === undefined
    ) {
      previous.text += text;
      if (previous.changed)
        previous.changed = [...new Set([...previous.changed, ...changedOf(value)])].sort();
      return;
    }
    last = {
      kind,
      text,
      ...(kind === 'format' ? { changed: changedOf(value).sort() } : {}),
      ...(element !== undefined ? { element } : {}),
      ...(breakKind !== undefined ? { breakKind } : {}),
    };
    entry.parts.push(last);
  };
  const walk = (parent: Y.XmlFragment | Y.XmlElement, inParagraph: boolean): void => {
    for (const node of elementsOf(parent)) {
      if (node instanceof Y.XmlText) {
        for (const op of deltaOf(node)) {
          const text = typeof op.insert === 'string' ? op.insert : '';
          const marks = TEXT_KINDS.filter(([name]) => isSuggestionMark(op.attributes?.[name]));
          if (marks.length === 0) last = null;
          for (const [name, kind] of marks) add(op.attributes![name], kind, text);
        }
        continue;
      }
      const name = node.nodeName;
      if (name === PARAGRAPH) {
        const kind = suggestedBreakKind(node.getAttribute('props'), isEmpty(node));
        add(node.getAttribute(INSERTION_MARK), 'break', '', undefined, kind);
        add(node.getAttribute(DELETION_MARK), 'join', '');
        add(node.getAttribute(PARAGRAPH_FORMAT_CHANGE), 'paragraph-format', '');
        last = null;
        walk(node, true);
        last = null;
        continue;
      }
      const element = elementOf(node);
      add(
        node.getAttribute(INSERTION_MARK),
        inParagraph ? 'insertion' : 'block-insertion',
        name,
        element,
      );
      add(
        node.getAttribute(DELETION_MARK),
        inParagraph ? 'deletion' : 'block-deletion',
        name,
        element,
      );
      if (!inParagraph) {
        last = null;
        walk(node, false);
      }
    }
  };
  for (const { tab, story, fragment } of liveWritings(doc)) {
    last = null;
    where = story === undefined ? { tab } : { tab, story };
    walk(fragment, false);
  }
  return [...found.entries()].map(([id, { mark, tab, story, parts }]) => ({
    id,
    at: mark.at,
    author: mark.author,
    tab,
    ...(story === undefined ? {} : { story }),
    parts,
  }));
}

/** The distinct suggestions the bodies hold. */
const count = (doc: Y.Doc): number => read(doc).length;

/** Appends a paragraph's content to the paragraph at `into` before it, its first text into the other's last. */
function joinInto(parent: Y.XmlFragment | Y.XmlElement, index: number, into: number): void {
  const paragraph = parent.get(index) as Y.XmlElement;
  const previous = parent.get(into) as Y.XmlElement;
  for (const child of elementsOf(paragraph)) {
    const tail = previous.length > 0 ? previous.get(previous.length - 1) : null;
    if (child instanceof Y.XmlText && tail instanceof Y.XmlText) {
      tail.applyDelta([{ retain: tail.length }, ...(deltaOf(child) as { insert: string }[])]);
    } else {
      previous.push([child.clone()]);
    }
  }
  parent.delete(index, 1);
}

/** Settles some suggestions' marks on a text: deletes what goes, formats what stays. */
function settleText(text: Y.XmlText, ids: ReadonlySet<string>, accept: boolean): void {
  const steps: {
    at: number;
    length: number;
    drop: boolean;
    attributes: Record<string, unknown>;
  }[] = [];
  let at = 0;
  for (const op of deltaOf(text)) {
    const length = typeof op.insert === 'string' ? op.insert.length : 1;
    const attrs = op.attributes ?? {};
    const inserted = marksOf(attrs[INSERTION_MARK], ids);
    const deleted = marksOf(attrs[DELETION_MARK], ids);
    const formatted = marksOf(attrs[FORMAT_CHANGE_MARK], ids);
    if (inserted || deleted || formatted) {
      const drop = (inserted && !accept) || (deleted && accept);
      const attributes: Record<string, unknown> = {};
      if (inserted) attributes[INSERTION_MARK] = null;
      if (deleted) attributes[DELETION_MARK] = null;
      if (formatted) {
        attributes[FORMAT_CHANGE_MARK] = null;
        if (!accept)
          Object.assign(attributes, (attrs[FORMAT_CHANGE_MARK] as FormatChangeMark).before ?? {});
      }
      steps.push({ at, length, drop, attributes });
    }
    at += length;
  }
  for (const step of steps.reverse()) {
    if (step.drop) text.delete(step.at, step.length);
    else text.format(step.at, step.length, step.attributes);
  }
}

/** Puts a paragraph's style, formatting and list back as its paragraph format suggestion had them. */
function restoreParagraph(
  paragraph: Y.XmlElement,
  before: ParagraphFormatChangeMark['before'],
): void {
  for (const name of ['style', 'props', 'list'] as const) {
    const value = before[name];
    if (value === null || value === undefined) paragraph.removeAttribute(name);
    else paragraph.setAttribute(name, value as string);
  }
}

/** Whether settling takes a block away: its insertion rejected or its deletion accepted. */
const takenAway = (node: unknown, ids: ReadonlySet<string>, accept: boolean): boolean =>
  node instanceof Y.XmlElement &&
  node.nodeName !== PARAGRAPH &&
  marksOf(node.getAttribute(accept ? DELETION_MARK : INSERTION_MARK), ids);

/** Settles some suggestions within a parent's children, from the last backwards so indexes hold. */
function settleChildren(
  parent: Y.XmlFragment | Y.XmlElement,
  ids: ReadonlySet<string>,
  accept: boolean,
  inParagraph: boolean,
  // The tables a column of this suggestion was accepted into.
  widened: Set<Y.XmlElement> = new Set(),
): void {
  for (let index = parent.length - 1; index >= 0; index--) {
    const node = parent.get(index);
    if (node instanceof Y.XmlText) {
      settleText(node, ids, accept);
      continue;
    }
    if (!(node instanceof Y.XmlElement)) continue;
    if (node.nodeName === PARAGRAPH && !inParagraph) {
      settleChildren(node, ids, accept, true, widened);
      const format = node.getAttribute(PARAGRAPH_FORMAT_CHANGE) as unknown;
      if (marksOf(format, ids)) {
        if (!accept) restoreParagraph(node, (format as ParagraphFormatChangeMark).before ?? {});
        node.removeAttribute(PARAGRAPH_FORMAT_CHANGE);
      }
      const joins =
        (marksOf(node.getAttribute(INSERTION_MARK), ids) && !accept) ||
        (marksOf(node.getAttribute(DELETION_MARK), ids) && accept);
      if (marksOf(node.getAttribute(INSERTION_MARK), ids)) node.removeAttribute(INSERTION_MARK);
      if (marksOf(node.getAttribute(DELETION_MARK), ids)) node.removeAttribute(DELETION_MARK);
      // The paragraph it joins: the one before, past any block this settling takes away.
      let before = index - 1;
      while (before >= 0 && takenAway(parent.get(before), ids, accept)) before--;
      const previous = before >= 0 ? parent.get(before) : null;
      if (joins && previous instanceof Y.XmlElement && previous.nodeName === PARAGRAPH)
        joinInto(parent, index, before);
      // A rejected break with no paragraph before it (first, or after a block), or an accepted join after a block: its
      // paragraph goes when nothing of it is left and something follows it.
      else if (joins && (before >= 0 || !accept) && index < parent.length - 1 && isEmpty(node))
        parent.delete(index, 1);
      continue;
    }
    // A merged cell crossing a row or column this settling takes away shrinks first, read on the whole grid.
    if (node.nodeName === TABLE) shrinkCrossingSpans(node, (part) => takenAway(part, ids, accept));
    if (!inParagraph) settleChildren(node, ids, accept, false, widened);
    const inserted = marksOf(node.getAttribute(INSERTION_MARK), ids);
    const deleted = marksOf(node.getAttribute(DELETION_MARK), ids);
    if (inserted && accept && (node.nodeName === TABLE_CELL || node.nodeName === TABLE_HEADER)) {
      const table = parent.parent;
      if (table instanceof Y.XmlElement) widened.add(table as Y.XmlElement);
    }
    if (
      (inserted && !accept) ||
      (deleted && accept) ||
      emptiedContainer(node.nodeName, node.length)
    ) {
      parent.delete(index, 1);
      continue;
    }
    if (inserted) node.removeAttribute(INSERTION_MARK);
    if (deleted) node.removeAttribute(DELETION_MARK);
  }
}

/** How wide the text is where a settled table stands, in points: a table a column made wider is fitted to it. */
export type SuggestionFit = { readonly width: number };

/** Settles the suggestions `ids` in one transaction; how many there were. */
function settleIds(
  doc: Y.Doc,
  ids: ReadonlySet<string>,
  accept: boolean,
  origin: unknown,
  fit?: SuggestionFit,
): number {
  if (ids.size === 0) return 0;
  doc.transact(() => {
    const widened = new Set<Y.XmlElement>();
    for (const { fragment } of liveWritings(doc))
      settleChildren(fragment, ids, accept, false, widened);
    if (fit) for (const table of widened) if (table.parent) fitTableWidth(table, fit.width);
  }, origin);
  return ids.size;
}

function settle(
  doc: Y.Doc,
  id: string,
  accept: boolean,
  origin: unknown,
  fit?: SuggestionFit,
): boolean {
  if (!read(doc).some((s) => s.id === id)) return false;
  return settleIds(doc, new Set([id]), accept, origin, fit) > 0;
}

/**
 * Settles every suggestion of the document, or only those of the author whose key is `only`, in one transaction
 * (review.md "Reviewing suggestions"); how many.
 */
function settleAll(
  doc: Y.Doc,
  accept: boolean,
  origin: unknown,
  { only, fit }: { only?: string; fit?: SuggestionFit } = {},
): number {
  const ids = new Set(
    read(doc)
      .filter((s) => only === undefined || s.author.key === only)
      .map((s) => s.id),
  );
  return settleIds(doc, ids, accept, origin, fit);
}

/** A copy of the document with every suggestion accepted or rejected, the document untouched: a preview's. */
function settledCopy(doc: Y.Doc, accept: boolean): Y.Doc {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  settleAll(copy, accept, null);
  return copy;
}

export const LiveSuggestions = {
  read,
  count,
  /** Whether a value is a well-read suggestion mark whose author holds `key`. */
  isOwnMark: ownBy,
  /**
   * Accepts a suggestion in one transaction; false when the document holds no part of it. With `fit`, a table a
   * column of it was accepted into that now runs past the text's width is fitted to it (review.md "Rows and columns").
   */
  accept: (doc: Y.Doc, id: string, origin: unknown, fit?: SuggestionFit): boolean =>
    settle(doc, id, true, origin, fit),
  /** Rejects a suggestion in one transaction; false when the document holds no part of it. */
  reject: (doc: Y.Doc, id: string, origin: unknown): boolean => settle(doc, id, false, origin),
  /** Accepts or rejects every suggestion (or only `only`'s) as one change; how many (review.md "Reviewing suggestions"). */
  settleAll,
  settledCopy,
  ownRejected,
  ownMarksWellFormed,
} as const;
