// Lists in the writing (docs/specs/034-text-documents/lists.md "Making a list", "Levels", "Checklists"): a paragraph is
// in a list by its `list` place; the commands put the paragraphs the selection touches in a list or take them out,
// move items a level, tick checklist items, and give Enter, Backspace and Tab their meaning in an item. Each is one
// transaction; a new list's definition is written beside it, on the same undo step.
import type { Node as PmNode } from 'prosemirror-model';
import { TextSelection, type Command, type EditorState } from 'prosemirror-state';
import { LIST_LEVELS, ListDefinition, type ListPlace } from '@livedoc/text-documents';
import { selectedParagraphs } from './text-document-paragraphs';

export type ListKind = 'bullet' | 'number' | 'check';
export type Lists = Readonly<Record<string, ListDefinition>>;
/** The document's lists, and how a new one is added. */
export type ListsAccess = { read: () => Lists; add: (id: string, list: ListDefinition) => void };

export const placeOf = (node: PmNode): ListPlace | null =>
  (node.attrs as { list: ListPlace | null }).list ?? null;

const kindOf = (lists: Lists, place: ListPlace): ListKind =>
  ListDefinition.kindAt(lists[place.id], place.level);

const withList = (node: PmNode, list: ListPlace | null) => ({ ...node.attrs, list });

/** Whether every paragraph the selection touches is in a list of this kind. */
export function isListOn(state: EditorState, lists: Lists, kind: ListKind): boolean {
  const paragraphs = selectedParagraphs(state);
  return (
    paragraphs.length > 0 &&
    paragraphs.every(({ node }) => {
      const place = placeOf(node);
      return place !== null && kindOf(lists, place) === kind;
    })
  );
}

/** Bulleted, numbered or checklist: out of their lists when all are in one of the kind, else all in one list of it. */
export function toggleList(access: ListsAccess, kind: ListKind): Command {
  return (state, dispatch) => {
    const paragraphs = selectedParagraphs(state);
    if (paragraphs.length === 0) return false;
    const lists = access.read();
    const tr = state.tr;
    if (isListOn(state, lists, kind)) {
      for (const { node, pos } of paragraphs)
        tr.setNodeMarkup(pos, undefined, withList(node, null));
    } else {
      // The list just before, when it is of this kind, so the numbering runs on; else a new list.
      const first = paragraphs[0]!;
      const $before = state.doc.resolve(first.pos);
      const before = $before.nodeBefore ? placeOf($before.nodeBefore) : null;
      let id = before && kindOf(lists, before) === kind ? before.id : null;
      if (id === null) {
        id = ListDefinition.newId(Object.keys(lists));
        if (dispatch) access.add(id, ListDefinition.of(kind));
      }
      for (const { node, pos } of paragraphs)
        tr.setNodeMarkup(pos, undefined, withList(node, { id, level: placeOf(node)?.level ?? 0 }));
    }
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

const clampLevel = (level: number) => Math.min(LIST_LEVELS - 1, Math.max(0, level));

/** Every item the selection touches a level in (+1) or out (−1); declines when it touches none. */
export function stepListLevel(delta: number): Command {
  return (state, dispatch) => {
    const items = selectedParagraphs(state).filter(({ node }) => placeOf(node));
    if (items.length === 0) return false;
    const tr = state.tr;
    for (const { node, pos } of items) {
      const place = placeOf(node)!;
      tr.setNodeMarkup(
        pos,
        undefined,
        withList(node, { ...place, level: clampLevel(place.level + delta) }),
      );
    }
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

/** Ticks the checklist items the selection touches unless all are ticked, then unticks them. */
export function toggleChecked(readLists: () => Lists): Command {
  return (state, dispatch) => {
    const lists = readLists();
    const items = selectedParagraphs(state).filter(({ node }) => {
      const place = placeOf(node);
      return place !== null && kindOf(lists, place) === 'check';
    });
    if (items.length === 0) return false;
    const tick = !items.every(({ node }) => placeOf(node)!.checked === true);
    const tr = state.tr;
    for (const { node, pos } of items) {
      const { checked: _, ...place } = placeOf(node)!;
      tr.setNodeMarkup(pos, undefined, withList(node, tick ? { ...place, checked: true } : place));
    }
    dispatch?.(tr);
    return true;
  };
}

/** One checklist item's box pressed: ticked or unticked. */
export function toggleItemAt(pos: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    const place = node ? placeOf(node) : null;
    if (!node || !place) return false;
    const { checked, ...rest } = place;
    dispatch?.(
      state.tr.setNodeMarkup(
        pos,
        undefined,
        withList(node, checked ? rest : { ...rest, checked: true }),
      ),
    );
    return true;
  };
}

/** The caret's item, when the caret is in one (nothing selected). */
function caretItem(state: EditorState) {
  const { $from, empty } = state.selection;
  const node = $from.parent;
  const place = empty && node.type.name === 'paragraph' ? placeOf(node) : null;
  return place ? { node, place, pos: $from.before(), atStart: $from.parentOffset === 0 } : null;
}

/** Enter in an item: a new item at its level; on an empty item, out of the list. */
export const enterInList: Command = (state, dispatch) => {
  const item = caretItem(state);
  if (!item) return false;
  const { node, place, pos } = item;
  if (node.content.size === 0) {
    dispatch?.(state.tr.setNodeMarkup(pos, undefined, withList(node, null)));
    return true;
  }
  const tr = state.tr;
  const at = state.selection.from;
  tr.split(at, 1, [
    { type: node.type, attrs: withList(node, { id: place.id, level: place.level }) },
  ]);
  tr.setSelection(TextSelection.create(tr.doc, at + 2));
  dispatch?.(tr.scrollIntoView());
  return true;
};

/** Backspace at an item's start: out of the list, its text where it stands. */
export const backspaceInList: Command = (state, dispatch) => {
  const item = caretItem(state);
  if (!item?.atStart) return false;
  dispatch?.(state.tr.setNodeMarkup(item.pos, undefined, withList(item.node, null)));
  return true;
};

/** Tab (+1) and Shift+Tab (−1) at an item's start: a level in or out. */
export const tabInList =
  (delta: number): Command =>
  (state, dispatch) =>
    caretItem(state)?.atStart ? stepListLevel(delta)(state, dispatch) : false;
