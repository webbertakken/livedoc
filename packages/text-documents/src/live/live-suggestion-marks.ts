// A suggestion's marks in the live state (docs/specs/034-text-documents/review.md "How a suggestion is kept"): what each
// part carries, how a value reads as one, the limits a person's editor keeps, and reading the elements and text runs
// that hold them. Shared by settling suggestions and by the room's judge reading.
import * as Y from 'yjs';
import { TABLE, TABLE_ROW } from './live-names';
import type { TextDocumentCommentAuthor } from './live-threads';

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

export const isObject = (value: unknown): value is Record<string, unknown> =>
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

export const elementsOf = (parent: Y.XmlFragment | Y.XmlElement): (Y.XmlElement | Y.XmlText)[] =>
  parent
    .toArray()
    .filter(
      (c): c is Y.XmlElement | Y.XmlText => c instanceof Y.XmlElement || c instanceof Y.XmlText,
    );

/** Whether an element holds nothing: no element, no text. */
export const isEmpty = (parent: Y.XmlElement): boolean =>
  elementsOf(parent).every((c) => c instanceof Y.XmlText && c.length === 0);

export type DeltaOp = { insert?: unknown; attributes?: Record<string, unknown> };
export const deltaOf = (text: Y.XmlText): DeltaOp[] => text.toDelta() as DeltaOp[];

/** A table left with no rows, or a row left with no cells: it goes with them (review.md "How a suggestion is kept"). */
export const emptiedContainer = (name: string, children: number): boolean =>
  (name === TABLE || name === TABLE_ROW) && children === 0;
