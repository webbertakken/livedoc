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
  SUGGESTION_MARKS,
} from './live-names';
import { tabFragment } from './live-root';
import { liveTabIds } from './live-tabs';
import type { TextDocumentCommentAuthor } from './live-threads';

export {
  DELETION_MARK,
  FORMAT_CHANGE_MARK,
  INSERTION_MARK,
  PARAGRAPH_FORMAT_CHANGE,
  SUGGESTION_MARKS,
};

/** The most suggestions one document holds (review.md "How a suggestion is kept", (default)). */
export const TEXT_DOCUMENT_SUGGESTIONS_MAX = 5000;
/** The longest suggestion id. */
export const SUGGESTION_ID_MAX = 64;
/** The longest name a suggestion's author carries, as a mention's. */
export const SUGGESTION_AUTHOR_NAME_MAX = 100;

/** What each part of a suggestion carries: its id, when it was made and by whom. */
export type SuggestionMark = {
  readonly id: string;
  readonly at: number;
  readonly author: TextDocumentCommentAuthor;
};

/** A format suggestion's mark: each text property mark it changed, with its attributes before (null: none). */
export type FormatChangeMark = SuggestionMark & {
  readonly before: Readonly<Record<string, unknown>>;
};

/** A paragraph format suggestion's mark: the paragraph's style, formatting and list before (null: none). */
export type ParagraphFormatChangeMark = SuggestionMark & {
  readonly before: { readonly style: unknown; readonly props: unknown; readonly list: unknown };
};

export type SuggestionPartKind =
  | 'insertion'
  | 'deletion'
  | 'format'
  | 'break'
  | 'join'
  | 'paragraph-format'
  | 'block-insertion'
  | 'block-deletion';

/** One stretch or element of a suggestion: its kind, its text (an object's or a block's: its element's name). */
export type SuggestionPart = {
  readonly kind: SuggestionPartKind;
  readonly text: string;
};

export type TextDocumentSuggestion = SuggestionMark & {
  /** The document tab its first part is in. */
  readonly tab: string;
  readonly parts: readonly SuggestionPart[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a value reads as a suggestion's mark: an id, a time and an author with a name. */
export function isSuggestionMark(value: unknown): value is SuggestionMark {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    value.id !== '' &&
    typeof value.at === 'number' &&
    isObject(value.author) &&
    typeof value.author.name === 'string'
  );
}

/** Whether a suggestion's mark is within its limits and the shape a person's editor writes. */
export function isWellFormedMark(value: unknown): boolean {
  if (!isSuggestionMark(value)) return false;
  const { id, at, author } = value;
  return (
    id.length <= SUGGESTION_ID_MAX &&
    Number.isFinite(at) &&
    typeof author.key === 'string' &&
    author.name.length <= SUGGESTION_AUTHOR_NAME_MAX &&
    typeof author.colour === 'string' &&
    author.colour.length <= 32 &&
    (!('before' in value) || isObject((value as { before?: unknown }).before))
  );
}

const marksOf = (value: unknown, id: string): boolean => isSuggestionMark(value) && value.id === id;

const elementsOf = (parent: Y.XmlFragment | Y.XmlElement): (Y.XmlElement | Y.XmlText)[] =>
  parent
    .toArray()
    .filter(
      (c): c is Y.XmlElement | Y.XmlText => c instanceof Y.XmlElement || c instanceof Y.XmlText,
    );

type DeltaOp = { insert?: unknown; attributes?: Record<string, unknown> };
const deltaOf = (text: Y.XmlText): DeltaOp[] => text.toDelta() as DeltaOp[];

const TEXT_KINDS: readonly [string, SuggestionPartKind][] = [
  [INSERTION_MARK, 'insertion'],
  [DELETION_MARK, 'deletion'],
  [FORMAT_CHANGE_MARK, 'format'],
];

/** The document's suggestions, in the tabs' order and the writing's, each with its parts. */
function read(doc: Y.Doc): TextDocumentSuggestion[] {
  const found = new Map<
    string,
    { mark: SuggestionMark; tab: string; parts: { kind: SuggestionPartKind; text: string }[] }
  >();
  let last: { kind: SuggestionPartKind; text: string } | null = null;
  const add = (tab: string, value: unknown, kind: SuggestionPartKind, text: string) => {
    if (!isSuggestionMark(value)) return;
    let entry = found.get(value.id);
    if (!entry) {
      entry = { mark: value, tab, parts: [] };
      found.set(value.id, entry);
    }
    const previous = entry.parts.at(-1);
    if (
      previous &&
      previous === last &&
      previous.kind === kind &&
      kind !== 'break' &&
      kind !== 'join'
    ) {
      previous.text += text;
      return;
    }
    last = { kind, text };
    entry.parts.push(last);
  };
  const walk = (tab: string, parent: Y.XmlFragment | Y.XmlElement, inParagraph: boolean): void => {
    for (const node of elementsOf(parent)) {
      if (node instanceof Y.XmlText) {
        for (const op of deltaOf(node)) {
          const text = typeof op.insert === 'string' ? op.insert : '';
          const marks = TEXT_KINDS.filter(([name]) => isSuggestionMark(op.attributes?.[name]));
          if (marks.length === 0) last = null;
          for (const [name, kind] of marks) add(tab, op.attributes![name], kind, text);
        }
        continue;
      }
      const name = node.nodeName;
      if (name === PARAGRAPH) {
        add(tab, node.getAttribute(INSERTION_MARK), 'break', '');
        add(tab, node.getAttribute(DELETION_MARK), 'join', '');
        add(tab, node.getAttribute(PARAGRAPH_FORMAT_CHANGE), 'paragraph-format', '');
        last = null;
        walk(tab, node, true);
        last = null;
        continue;
      }
      add(
        tab,
        node.getAttribute(INSERTION_MARK),
        inParagraph ? 'insertion' : 'block-insertion',
        name,
      );
      add(tab, node.getAttribute(DELETION_MARK), inParagraph ? 'deletion' : 'block-deletion', name);
      if (!inParagraph) {
        last = null;
        walk(tab, node, false);
      }
    }
  };
  for (const tab of liveTabIds(doc)) {
    last = null;
    walk(tab, tabFragment(doc, tab), false);
  }
  return [...found.entries()].map(([id, { mark, tab, parts }]) => ({
    id,
    at: mark.at,
    author: mark.author,
    tab,
    parts,
  }));
}

/** The distinct suggestions the bodies hold. */
const count = (doc: Y.Doc): number => read(doc).length;

/** Appends a paragraph's content to the paragraph before it, its first text into the other's last. */
function joinIntoPrevious(parent: Y.XmlFragment | Y.XmlElement, index: number): void {
  const paragraph = parent.get(index) as Y.XmlElement;
  const previous = parent.get(index - 1) as Y.XmlElement;
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

/** Settles one suggestion's marks on a text: deletes what goes, formats what stays. */
function settleText(text: Y.XmlText, id: string, accept: boolean): void {
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
    const inserted = marksOf(attrs[INSERTION_MARK], id);
    const deleted = marksOf(attrs[DELETION_MARK], id);
    const formatted = marksOf(attrs[FORMAT_CHANGE_MARK], id);
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

/** Settles one suggestion within a parent's children, from the last backwards so indexes hold. */
function settleChildren(
  parent: Y.XmlFragment | Y.XmlElement,
  id: string,
  accept: boolean,
  inParagraph: boolean,
): void {
  for (let index = parent.length - 1; index >= 0; index--) {
    const node = parent.get(index);
    if (node instanceof Y.XmlText) {
      settleText(node, id, accept);
      continue;
    }
    if (!(node instanceof Y.XmlElement)) continue;
    if (node.nodeName === PARAGRAPH && !inParagraph) {
      settleChildren(node, id, accept, true);
      const format = node.getAttribute(PARAGRAPH_FORMAT_CHANGE) as unknown;
      if (marksOf(format, id)) {
        if (!accept) restoreParagraph(node, (format as ParagraphFormatChangeMark).before ?? {});
        node.removeAttribute(PARAGRAPH_FORMAT_CHANGE);
      }
      const joins =
        (marksOf(node.getAttribute(INSERTION_MARK), id) && !accept) ||
        (marksOf(node.getAttribute(DELETION_MARK), id) && accept);
      if (marksOf(node.getAttribute(INSERTION_MARK), id)) node.removeAttribute(INSERTION_MARK);
      if (marksOf(node.getAttribute(DELETION_MARK), id)) node.removeAttribute(DELETION_MARK);
      const previous = index > 0 ? parent.get(index - 1) : null;
      if (joins && previous instanceof Y.XmlElement && previous.nodeName === PARAGRAPH)
        joinIntoPrevious(parent, index);
      continue;
    }
    if (!inParagraph) settleChildren(node, id, accept, false);
    const inserted = marksOf(node.getAttribute(INSERTION_MARK), id);
    const deleted = marksOf(node.getAttribute(DELETION_MARK), id);
    if ((inserted && !accept) || (deleted && accept)) {
      parent.delete(index, 1);
      continue;
    }
    if (inserted) node.removeAttribute(INSERTION_MARK);
    if (deleted) node.removeAttribute(DELETION_MARK);
  }
}

function settle(doc: Y.Doc, id: string, accept: boolean, origin: unknown): boolean {
  if (!read(doc).some((s) => s.id === id)) return false;
  doc.transact(() => {
    for (const tab of liveTabIds(doc)) settleChildren(tabFragment(doc, tab), id, accept, false);
  }, origin);
  return true;
}

// ---- The writing with one person's suggestions rejected, as plain values (the judge's reading). ----

type PlainText = { readonly text: { insert: string; attributes: Record<string, unknown> }[] };
type PlainElement = {
  readonly element: string;
  attributes: Record<string, unknown>;
  children: PlainNode[];
};
type PlainNode = PlainText | PlainElement;

/** A value with every object's keys in order, so equal values print equal. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Uint8Array) return [...value];
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

const sameAttributes = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** Adds a node to a list, a text joining the text before it and runs with equal attributes joining. */
function pushNode(list: PlainNode[], node: PlainNode): void {
  if (!('text' in node)) {
    list.push(node);
    return;
  }
  if (node.text.length === 0) return;
  const tail = list.at(-1);
  const into = tail && 'text' in tail ? tail : null;
  if (!into) {
    list.push({ text: [] });
    return pushNode(list, node);
  }
  for (const run of node.text) {
    const end = into.text.at(-1);
    if (end && sameAttributes(end.attributes, run.attributes)) end.insert += run.insert;
    else into.text.push({ ...run });
  }
}

const ownBy = (value: unknown, key: string): boolean =>
  isSuggestionMark(value) && value.author.key === key;

function plainText(text: Y.XmlText, key: string): PlainText {
  const runs: PlainText['text'] = [];
  for (const op of deltaOf(text)) {
    const attributes = { ...(op.attributes ?? {}) };
    if (ownBy(attributes[INSERTION_MARK], key)) continue;
    if (ownBy(attributes[DELETION_MARK], key)) delete attributes[DELETION_MARK];
    const format = attributes[FORMAT_CHANGE_MARK];
    if (ownBy(format, key)) {
      delete attributes[FORMAT_CHANGE_MARK];
      for (const [name, value] of Object.entries((format as FormatChangeMark).before ?? {})) {
        if (value === null || value === undefined) delete attributes[name];
        else attributes[name] = value;
      }
    }
    runs.push({
      insert: typeof op.insert === 'string' ? op.insert : JSON.stringify(op.insert),
      attributes,
    });
  }
  return { text: runs };
}

function plainChildren(
  parent: Y.XmlFragment | Y.XmlElement,
  key: string,
  inParagraph: boolean,
): PlainNode[] {
  const out: PlainNode[] = [];
  for (const node of elementsOf(parent)) {
    if (node instanceof Y.XmlText) {
      pushNode(out, plainText(node, key));
      continue;
    }
    const attributes: Record<string, unknown> = { ...node.getAttributes() };
    const paragraph = node.nodeName === PARAGRAPH && !inParagraph;
    if (!paragraph && ownBy(attributes[INSERTION_MARK], key)) continue;
    if (ownBy(attributes[DELETION_MARK], key)) delete attributes[DELETION_MARK];
    const format = attributes[PARAGRAPH_FORMAT_CHANGE];
    if (paragraph && ownBy(format, key)) {
      delete attributes[PARAGRAPH_FORMAT_CHANGE];
      for (const [name, value] of Object.entries(
        (format as ParagraphFormatChangeMark).before ?? {},
      )) {
        if (value === null || value === undefined) delete attributes[name];
        else attributes[name] = value;
      }
    }
    const children = plainChildren(node, key, inParagraph || paragraph);
    if (paragraph && ownBy(attributes[INSERTION_MARK], key)) {
      delete attributes[INSERTION_MARK];
      const previous = out.at(-1);
      if (previous && 'element' in previous && previous.element === PARAGRAPH) {
        for (const child of children) pushNode(previous.children, child);
        continue;
      }
    }
    out.push({ element: node.nodeName, attributes, children });
  }
  return out;
}

/** The fragment as it reads with `key`'s suggestions rejected, printed so equal readings print equal. */
const ownRejected = (fragment: Y.XmlFragment, key: string): string =>
  JSON.stringify(canonical(plainChildren(fragment, key, false)));

/** Whether every mark carrying `key` in the fragment is well formed. */
function ownMarksWellFormed(fragment: Y.XmlFragment | Y.XmlElement, key: string): boolean {
  for (const node of elementsOf(fragment)) {
    if (node instanceof Y.XmlText) {
      for (const op of deltaOf(node))
        for (const name of SUGGESTION_MARKS) {
          const value = op.attributes?.[name];
          if (ownBy(value, key) && !isWellFormedMark(value)) return false;
        }
      continue;
    }
    for (const name of [INSERTION_MARK, DELETION_MARK, PARAGRAPH_FORMAT_CHANGE]) {
      const value = node.getAttribute(name) as unknown;
      if (ownBy(value, key) && !isWellFormedMark(value)) return false;
    }
    if (!ownMarksWellFormed(node, key)) return false;
  }
  return true;
}

export const LiveSuggestions = {
  read,
  count,
  /** Accepts a suggestion in one transaction; false when the document holds no part of it. */
  accept: (doc: Y.Doc, id: string, origin: unknown): boolean => settle(doc, id, true, origin),
  /** Rejects a suggestion in one transaction; false when the document holds no part of it. */
  reject: (doc: Y.Doc, id: string, origin: unknown): boolean => settle(doc, id, false, origin),
  ownRejected,
  ownMarksWellFormed,
} as const;
