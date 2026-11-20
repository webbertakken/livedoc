// List styles and numbering in the writing (docs/specs/034-text-documents/lists.md "List styles", "Numbering"): a preset
// taken by the list the selection is in, or by a new list; a numbered item's level restarted at a number; a restart
// taken back, or a list joined to the numbered list before it. Each is one transaction, or one list written.
import type { Node as PmNode } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import {
  LIST_RESTART_MAX,
  LIST_RESTART_MIN,
  ListDefinition,
  ListPresets,
  type ListPlace,
  type ListPreset,
} from '@livedoc/text-documents';
import { selectedParagraphs } from './text-document-paragraphs';
import { placeOf, type Lists, type ListsAccess } from './text-document-lists';

const isNumbered = (lists: Lists, place: ListPlace | null): place is ListPlace =>
  place !== null &&
  !place.unnumbered &&
  ListDefinition.kindAt(lists[place.id], place.level) === 'number';

/** The list the selection's paragraphs are all in; null when one is in none, or they are in two. */
function oneList(state: EditorState): string | null {
  const ids = new Set(selectedParagraphs(state).map(({ node }) => placeOf(node)?.id ?? null));
  const [only] = ids;
  return ids.size === 1 && only !== undefined ? only : null;
}

/** The preset the caret's list looks like; null off a list, or for a list of a look of its own. */
export function presetAt(state: EditorState, lists: Lists): ListPreset | null {
  const place = placeOf(state.selection.$from.parent);
  return place ? ListPresets.matching(lists[place.id]) : null;
}

/** The list the selection is in takes the preset, all its items; else the paragraphs join a new list of it. */
export function applyListPreset(access: ListsAccess, preset: ListPreset): Command {
  return (state, dispatch) => {
    const paragraphs = selectedParagraphs(state);
    if (paragraphs.length === 0) return false;
    if (!dispatch) return true;
    const lists = access.read();
    const id = oneList(state);
    if (id !== null && id in lists) {
      // The paragraphs stay as they are: the list drawn anew is the change.
      access.set(id, preset.list);
      dispatch(state.tr.scrollIntoView());
      return true;
    }
    const added = ListDefinition.newId(Object.keys(lists));
    access.set(added, preset.list);
    const tr = state.tr;
    for (const { node, pos } of paragraphs)
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        list: { id: added, level: placeOf(node)?.level ?? 0 },
      });
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** The first numbered item the selection touches. */
function numberedItem(state: EditorState, lists: Lists) {
  for (const { node, pos } of selectedParagraphs(state)) {
    const place = placeOf(node);
    if (isNumbered(lists, place)) return { node, pos, place };
  }
  return null;
}

/** The number Restart numbering opens with (the item's restart, else 1); null where there is no numbered item. */
export function restartAt(state: EditorState, lists: Lists): number | null {
  const item = numberedItem(state, lists);
  return item ? (item.place.restart ?? 1) : null;
}

const withPlace = (node: PmNode, list: ListPlace) => ({ ...node.attrs, list });

/** The first numbered item's level starts again at `start`, a whole number from 0 to 32767. */
export function restartNumbering(readLists: () => Lists, start: number): Command {
  return (state, dispatch) => {
    if (!Number.isInteger(start) || start < LIST_RESTART_MIN || start > LIST_RESTART_MAX)
      return false;
    const item = numberedItem(state, readLists());
    if (!item) return false;
    dispatch?.(
      state.tr.setNodeMarkup(
        item.pos,
        undefined,
        withPlace(item.node, { ...item.place, restart: start }),
      ),
    );
    return true;
  };
}

/** Takes back the first numbered item's restart; or joins its list to the numbered list before the list's first item. */
export function continueNumbering(readLists: () => Lists): Command {
  return (state, dispatch) => {
    const lists = readLists();
    const item = numberedItem(state, lists);
    if (!item) return false;
    if (item.place.restart !== undefined) {
      const { restart: _, ...place } = item.place;
      dispatch?.(state.tr.setNodeMarkup(item.pos, undefined, withPlace(item.node, place)));
      return true;
    }
    // The list before: the nearest numbered item of another list before this list's first item.
    const own = item.place.id;
    let before: string | null = null;
    let reachedOwn = false;
    const members: { node: PmNode; pos: number; place: ListPlace }[] = [];
    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return true;
      const place = placeOf(node);
      if (place?.id === own) {
        reachedOwn = true;
        members.push({ node, pos, place });
      } else if (!reachedOwn && isNumbered(lists, place)) before = place.id;
      return false;
    });
    if (before === null) return false;
    const into: string = before;
    const tr = state.tr;
    for (const { node, pos, place } of members)
      tr.setNodeMarkup(pos, undefined, withPlace(node, { ...place, id: into }));
    dispatch?.(tr);
    return true;
  };
}
