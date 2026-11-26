// Suggestion cards (docs/specs/034-text-documents/review.md "Suggestion cards"): each suggestion in the writing read
// as one card, in the order of its first part, with its author, time and what it does, one line per kind: Add,
// Delete or Replace for text, Format naming what changed, a paragraph break added or deleted, a paragraph's format,
// and an object or block by its name. Read from the editor's document as it stands, so a card is where its text is.
import type { Mark, Node as PmNode } from 'prosemirror-model';
import {
  DELETION_MARK,
  FORMAT_CHANGE_MARK,
  INSERTION_MARK,
  PARAGRAPH_FORMAT_CHANGE,
  type SuggestionPart,
  type TextDocumentCommentAuthor,
} from '@livedoc/text-documents';

/** The longest quote a card shows before its ellipsis (review.md, (default)). */
export const SUGGESTION_QUOTE_MAX = 60;

export type SuggestionCard = {
  readonly id: string;
  /** Where its first part starts and its last part ends in the writing. */
  readonly from: number;
  readonly to: number;
  /** When its first part was made, and by whom. */
  readonly at: number;
  readonly author: TextDocumentCommentAuthor;
  readonly lines: readonly string[];
};

/** One part read off the writing. */
export type CardPart =
  | { readonly kind: 'insertion' | 'deletion'; readonly text: string }
  | { readonly kind: 'format'; readonly changed: readonly string[] }
  | { readonly kind: 'object-insertion' | 'object-deletion'; readonly name: string }
  | { readonly kind: 'break' | 'join' | 'paragraph-format' };

/** What a format suggestion names, in the order a card lists it. */
export const FORMAT_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['bold', 'Bold'],
  ['italic', 'Italic'],
  ['underline', 'Underline'],
  ['strike', 'Strikethrough'],
  ['vertical', 'Superscript or subscript'],
  ['small_caps', 'Small caps'],
  ['font', 'Font'],
  ['size', 'Font size'],
  ['color', 'Text colour'],
  ['highlight', 'Highlight colour'],
  ['link', 'Link'],
  ['text_style', 'Text style'],
];
const OTHER_FORMAT = 'Text formatting';

/** An object's or a block's name on a card; anything else is an Object. */
const OBJECT_LABELS: Readonly<Record<string, string>> = {
  picture: 'Picture',
  equation: 'Equation',
  footnote: 'Footnote',
  field: 'Field',
  bookmark: 'Bookmark',
  table: 'Table',
  section_break: 'Section break',
  table_of_contents: 'Table of contents',
};
const OTHER_OBJECT = 'Object';

/** Text as a card quotes it: whitespace folded to one space, cut with an ellipsis. */
export function quoteOf(text: string): string {
  const folded = text.replace(/\s+/g, ' ');
  return folded.length > SUGGESTION_QUOTE_MAX
    ? `${folded.slice(0, SUGGESTION_QUOTE_MAX)}…`
    : folded;
}

const uniqueNames = (names: readonly string[]) => [...new Set(names)];

/** What a card says, one line per kind: text, formatting, objects, paragraph breaks, paragraph formats. */
export function cardLines(parts: readonly CardPart[]): string[] {
  const inserted = parts.flatMap((p) => (p.kind === 'insertion' ? [p.text] : [])).join('');
  const deleted = parts.flatMap((p) => (p.kind === 'deletion' ? [p.text] : [])).join('');
  const lines: string[] = [];
  if (inserted && deleted) lines.push(`Replace: “${quoteOf(deleted)}” with “${quoteOf(inserted)}”`);
  else if (inserted) lines.push(`Add: “${quoteOf(inserted)}”`);
  else if (deleted) lines.push(`Delete: “${quoteOf(deleted)}”`);

  const changed = new Set(parts.flatMap((p) => (p.kind === 'format' ? p.changed : [])));
  if (changed.size > 0) {
    const known = FORMAT_LABELS.filter(([name]) => changed.has(name)).map(([, label]) => label);
    const other = [...changed].some((name) => !FORMAT_LABELS.some(([known]) => known === name));
    lines.push(`Format: ${[...known, ...(other ? [OTHER_FORMAT] : [])].join(', ')}`);
  }

  for (const [kind, verb] of [
    ['object-insertion', 'Add'],
    ['object-deletion', 'Delete'],
  ] as const)
    for (const name of uniqueNames(parts.flatMap((p) => (p.kind === kind ? [p.name] : []))))
      lines.push(`${verb}: ${name}`);
  if (parts.some((p) => p.kind === 'break')) lines.push('Add: Paragraph break');
  if (parts.some((p) => p.kind === 'join')) lines.push('Delete: Paragraph break');
  if (parts.some((p) => p.kind === 'paragraph-format')) lines.push('Format: Paragraph');
  return lines;
}

type Read = { id: string; at: number; author: TextDocumentCommentAuthor };

/** A suggestion's mark or attribute as read, or null where it is not one. */
function readMark(value: unknown): Read | null {
  if (!value || typeof value !== 'object') return null;
  const { id, at, author } = value as { id?: unknown; at?: unknown; author?: unknown };
  const name = (author as { name?: unknown } | null | undefined)?.name;
  if (typeof id !== 'string' || id === '' || typeof name !== 'string' || name === '') return null;
  return { id, at: typeof at === 'number' ? at : 0, author: author as TextDocumentCommentAuthor };
}

const markOf = (marks: readonly Mark[], name: string) =>
  marks.find((m) => m.type.name === name)?.attrs;

/** An object's or a block's name on a card, by its element's name. */
export const objectLabel = (name: string): string => OBJECT_LABELS[name] ?? OTHER_OBJECT;

const objectName = (node: PmNode) => objectLabel(node.type.name);

/** The live state's parts of a suggestion (LiveSuggestions.read) as a card's, for the comments panel's rows. */
export function cardPartsOf(parts: readonly SuggestionPart[]): CardPart[] {
  return parts.map((part): CardPart => {
    switch (part.kind) {
      case 'insertion':
      case 'deletion':
        return part.element === undefined
          ? { kind: part.kind, text: part.text }
          : { kind: `object-${part.kind}`, name: objectLabel(part.element) };
      case 'block-insertion':
        return { kind: 'object-insertion', name: objectLabel(part.element ?? part.text) };
      case 'block-deletion':
        return { kind: 'object-deletion', name: objectLabel(part.element ?? part.text) };
      case 'format':
        // A format naming nothing is still one: an unnamed change reads as Text formatting.
        return { kind: 'format', changed: part.changed?.length ? part.changed : [''] };
      default:
        return { kind: part.kind };
    }
  });
}

/** Every suggestion in the writing, in the order of its first part. */
export function suggestionCards(doc: PmNode): SuggestionCard[] {
  const found = new Map<string, { first: Read; from: number; to: number; parts: CardPart[] }>();
  const add = (value: unknown, from: number, to: number, part: CardPart) => {
    const read = readMark(value);
    if (!read) return;
    const was = found.get(read.id);
    if (!was) found.set(read.id, { first: read, from, to, parts: [part] });
    else {
      was.from = Math.min(was.from, from);
      was.to = Math.max(was.to, to);
      was.parts.push(part);
    }
  };
  doc.descendants((node, pos) => {
    if (node.isText) {
      const end = pos + node.nodeSize;
      const value = node.text ?? '';
      add(markOf(node.marks, INSERTION_MARK), pos, end, { kind: 'insertion', text: value });
      add(markOf(node.marks, DELETION_MARK), pos, end, { kind: 'deletion', text: value });
      const format = markOf(node.marks, FORMAT_CHANGE_MARK) as { before?: unknown } | undefined;
      if (format) {
        const before = format.before && typeof format.before === 'object' ? format.before : {};
        add(format, pos, end, { kind: 'format', changed: Object.keys(before) });
      }
      return false;
    }
    if (node.type.name === 'paragraph') {
      const start = pos + 1;
      add(node.attrs[INSERTION_MARK], start, start, { kind: 'break' });
      add(node.attrs[DELETION_MARK], start, start, { kind: 'join' });
      add(node.attrs[PARAGRAPH_FORMAT_CHANGE], start, start, { kind: 'paragraph-format' });
      return true;
    }
    const end = pos + node.nodeSize;
    add(node.attrs[INSERTION_MARK], pos, end, { kind: 'object-insertion', name: objectName(node) });
    add(node.attrs[DELETION_MARK], pos, end, { kind: 'object-deletion', name: objectName(node) });
    return true;
  });
  return [...found.entries()]
    .map(([id, { first, from, to, parts }]) => ({
      id,
      from,
      to,
      at: first.at,
      author: first.author,
      lines: cardLines(parts),
    }))
    .sort((a, b) => a.from - b.from);
}

/** The next or previous suggestion: from the selected card, else from the caret; never wrapping. */
export function suggestionBeside(
  cards: readonly { readonly id: string; readonly from: number }[],
  selected: string | null,
  caret: number,
  forward: boolean,
): string | null {
  const at = selected === null ? -1 : cards.findIndex((c) => c.id === selected);
  if (at >= 0) return cards[at + (forward ? 1 : -1)]?.id ?? null;
  const found = forward ? cards.find((c) => c.from > caret) : cards.findLast((c) => c.from < caret);
  return found?.id ?? null;
}

/** Who may settle a suggestion here: an Editor both ways; a Participant rejects (takes back) their own alone. */
export type SuggestionRights = {
  /** An Editor, in a mode that shows suggestions. */
  readonly accepts: boolean;
  /** A person who suggests here: their own suggestions they may take back. */
  readonly ownKey: string | null;
};

/** What a card offers: Accept and Reject as the rights allow (review.md "Suggestion cards"). */
export function cardOffers(
  card: Pick<SuggestionCard, 'author'>,
  rights: SuggestionRights,
): { accept: boolean; reject: boolean } {
  const own = rights.ownKey !== null && card.author.key === rights.ownKey;
  return { accept: rights.accepts, reject: rights.accepts || own };
}
