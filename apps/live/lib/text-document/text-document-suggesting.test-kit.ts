// What the Suggesting transform's tests share (docs/specs/034-text-documents/review.md "While suggesting"): two people,
// a suggester, a state built from blocks, a command's transaction, the rewrite applied, and finding what it made.
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import { textDocumentSchema as schema } from './text-document-schema';
import { suggestTransaction, type Suggester } from './text-document-suggesting';
import { newTable } from './text-document-tables';

export const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
export const BEN = { key: 'k-ben', name: 'Ben', colour: '#16a34a' };
export const mark = (id: string, author = ADA, at = 5) => ({ id, at, author });
export const as = (person: typeof ADA, id = 's1'): Suggester => ({
  ...person,
  now: 100,
  newId: () => id,
});

export const p = (text = '') =>
  schema.nodes.paragraph!.create(null, text ? schema.text(text) : null);
/** A 2 × 2 table 200 points wide, with `attrs` laid over its own. */
export const table = (attrs: Record<string, unknown> = {}) => {
  const made = newTable({ rows: 2, columns: 2, width: 200 });
  return made.type.create({ ...made.attrs, ...attrs }, made.content);
};

export function stateWith(blocks: PmNode[], anchor: number, head = anchor) {
  const doc = schema.nodes.doc!.create(null, blocks);
  return EditorState.create({ doc, selection: TextSelection.create(doc, anchor, head) });
}

/** The transaction a command dispatches on `state`. */
export function commanded(
  state: EditorState,
  command: (s: EditorState, d: (tr: Transaction) => void) => boolean,
) {
  let made: Transaction | undefined;
  command(state, (tr) => (made = tr));
  return made!;
}

/** `tr` rewritten as `who`'s suggestions and applied; throws the refusal. */
export function suggest(state: EditorState, tr: Transaction, who = as(ADA)) {
  const result = suggestTransaction(state, tr, who);
  if ('refused' in result) throw new Error(result.refused);
  return state.apply(result.tr);
}

export const idOf = (value: unknown) => (value as { id?: string } | null)?.id;

/** The first node of type `name` in the state's document. */
export const blockOf = (state: EditorState, name: string) => {
  let found: PmNode | undefined;
  state.doc.descendants((n) => {
    if (!found && n.type.name === name) found = n;
    return !found;
  });
  return found;
};

/** The first cell's first paragraph's inside position of the first table in the doc. */
export const inFirstCell = (state: EditorState) => {
  let at = -1;
  state.doc.descendants((n, pos) => {
    if (at < 0 && n.type.name === 'paragraph' && state.doc.resolve(pos).depth > 0) at = pos + 1;
    return at < 0;
  });
  return at;
};
