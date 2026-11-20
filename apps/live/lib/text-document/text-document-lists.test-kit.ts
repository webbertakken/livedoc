// Lists in the writing, for their tests (docs/specs/034-text-documents/lists.md): paragraphs in lists, a selection over
// them, the lists a command reads and writes, and a command run once.
import { expect } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import type { ListDefinition, ListPlace } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import type { ListsAccess } from './text-document-lists';

export const p = (text: string, list: ListPlace | null = null) =>
  schema.nodes.paragraph!.create({ list }, text ? schema.text(text) : undefined);

// The selection from the start of paragraph `from` to the end of paragraph `to` (body indexes), or a caret.
export function stateOf(paragraphs: PmNode[], at: [number, number] | number = 0): EditorState {
  const doc = schema.node('doc', null, paragraphs);
  const start = (i: number) => {
    let pos = 0;
    for (let k = 0; k < i; k += 1) pos += doc.child(k).nodeSize;
    return pos + 1;
  };
  const selection =
    typeof at === 'number'
      ? TextSelection.create(doc, start(at))
      : TextSelection.create(doc, start(at[0]), start(at[1]) + doc.child(at[1]).content.size);
  return EditorState.create({ doc, selection });
}

export function access(
  lists: Record<string, ListDefinition> = {},
): ListsAccess & { added: [string, ListDefinition][] } {
  const added: [string, ListDefinition][] = [];
  return {
    added,
    read: () => lists,
    set: (id, list) => {
      added.push([id, list]);
      lists[id] = list;
    },
  };
}

export function run(state: EditorState, command: Command, ok = true): EditorState {
  let next = state;
  let steps = 0;
  expect(
    command(state, (tr) => {
      steps += 1;
      next = state.apply(tr);
    }),
  ).toBe(ok);
  expect(steps).toBe(ok ? 1 : 0);
  return next;
}
export const places = (state: EditorState) =>
  state.doc.content.content.map((n) => (n.attrs as { list: ListPlace | null }).list);
