// The writing with one person's suggestions rejected, as plain values (docs/specs/034-text-documents/review.md "How a
// suggestion is kept", the room's judge): a Participant's update is theirs when this reading is the same before and
// after it.
import * as Y from 'yjs';
import {
  DELETION_MARK,
  FORMAT_CHANGE_MARK,
  INSERTION_MARK,
  PARAGRAPH,
  PARAGRAPH_FORMAT_CHANGE,
  SUGGESTION_MARKS,
  TABLE,
} from './live-names';
import { crossingSpans, spanAttribute, type SpanChange } from './live-table-spans';

const NO_SPANS: ReadonlyMap<Y.XmlElement, SpanChange> = new Map();
import {
  deltaOf,
  elementsOf,
  emptiedContainer,
  isObject,
  isSuggestionMark,
  isWellFormedMark,
  type FormatChangeMark,
  type ParagraphFormatChangeMark,
} from './live-suggestion-marks';

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

export const ownBy = (value: unknown, key: string): boolean =>
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
  // A table's merged cells as they read once the person's own rows and cells are rejected (review.md "Across merged
  // cells"): a merged cell their row grew reads as before it.
  spans: ReadonlyMap<Y.XmlElement, SpanChange> = NO_SPANS,
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
    const change = spans.get(node);
    if (change) {
      for (const name of ['rowspan', 'colspan'] as const) {
        const value = spanAttribute(change[name]);
        if (value === undefined) delete attributes[name];
        else attributes[name] = value;
      }
      if (change.colwidth) attributes.colwidth = change.colwidth;
    }
    const inner =
      node.nodeName === TABLE
        ? crossingSpans(node, (part) => ownBy(part.getAttribute(INSERTION_MARK), key)).changes
        : spans;
    const children = plainChildren(node, key, inParagraph || paragraph, inner);
    if (paragraph && ownBy(attributes[INSERTION_MARK], key)) {
      delete attributes[INSERTION_MARK];
      const previous = out.at(-1);
      if (previous && 'element' in previous && previous.element === PARAGRAPH) {
        for (const child of children) pushNode(previous.children, child);
        continue;
      }
      // The first one, nothing of it left, with a node after it: gone, as rejecting it leaves it.
      if (out.length === 0 && children.length === 0 && node.nextSibling !== null) continue;
    }
    const plain = { element: node.nodeName, attributes, children };
    if (emptiedContainer(plain.element, plain.children.length)) continue;
    out.push(plain);
  }
  return out;
}

/** The fragment as it reads with `key`'s suggestions rejected, printed so equal readings print equal. */
export const ownRejected = (fragment: Y.XmlFragment, key: string): string =>
  JSON.stringify(canonical(plainChildren(fragment, key, false)));

/** Whether every mark carrying `key` in the fragment is well formed. */
export function ownMarksWellFormed(fragment: Y.XmlFragment | Y.XmlElement, key: string): boolean {
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
