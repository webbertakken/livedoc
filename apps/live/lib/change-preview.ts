import {
  acceptKindChange,
  acceptReword,
  eventStormingKindOf,
  isBoxed,
  nameSuggestionsFor,
  noteChangesOf,
  renameContext,
  renameTerm,
  sameContextName,
  type Element,
  type ElementId,
  type EventStormingNoteKind,
  type Layer,
  type Rect,
  type StickyElement,
} from '@livedoc/document';
import { arrangeOffer, lanePlanOffer, type BoardOffer } from './board-offer';
import { landSplit } from './suggested-changes-apply';
import { parsePreviewKey, type PreviewedChange } from './suggestion-view';

// What a suggested change would make of the board while a person points at it
// (docs/specs/021-event-storming/suggested-changes.md "How a person sees and decides"): the board as drawn, never as
// written. A reword draws its new words on every note it ripples to, a kind change the other kind's paper, a split
// its first part on the note and the others as placeholders with the board making room, a removal the note faint
// and struck, a name chip the context under that name; a lane plan or Arrange and Reorder the whole board as it would
// stand (docs/specs/021-event-storming/lane-plans.md, docs/specs/021-event-storming/arrange.md). Pure; the canvas
// draws it over an untouched board.

/** How much of its opacity a note keeps while its removal is previewed: faint, but its words still read
 *  (safe range: 0.25 to 0.5). */
export const REMOVE_PREVIEW_OPACITY = 0.35;

/** One further part of a previewed split, where accepting would land it. */
export type OfferedPart = { id: ElementId; kind: EventStormingNoteKind; words: string; spot: Rect };

export type OfferedPreview = {
  // The board with the offer's changes laid in: the same array when the offer changes nothing that is drawn.
  elements: Element[];
  // A split's further parts, and how far each note stands aside for them.
  parts: OfferedPart[];
  shiftX: ReadonlyMap<ElementId, number>;
  // The note a removal would take: drawn faint, for the layer to strike through.
  struck: ElementId | null;
  // The whole board rearranged (a lane plan, Arrange and Reorder): what the bar says of it.
  board: BoardOffer | null;
};

const NO_SHIFT: ReadonlyMap<ElementId, number> = new Map();

const plain = (elements: Element[]): OfferedPreview => ({
  elements,
  parts: [],
  shiftX: NO_SHIFT,
  struck: null,
  board: null,
});

const boxOf = ({ x, y, width, height }: Rect): Rect => ({ x, y, width, height });

function changePreview(
  elements: Element[],
  key: Extract<PreviewedChange, { type: 'change' }>,
  inertIds: ReadonlySet<ElementId>,
): OfferedPreview | null {
  const note = elements.find((el) => el.id === key.noteId);
  if (!note || note.type !== 'sticky' || note.locked || inertIds.has(note.id)) return null;
  const change = noteChangesOf(note)[key.index];
  if (!change) return null;
  switch (change.change) {
    case 'reword':
      return plain(acceptReword(elements, note.id, change, key.scope));
    case 'kind':
      return plain(acceptKindChange(elements, note.id, change));
    case 'remove':
      return {
        ...plain(
          elements.map((el) =>
            el.id === note.id
              ? { ...note, opacity: (note.opacity ?? 1) * REMOVE_PREVIEW_OPACITY }
              : el,
          ),
        ),
        struck: note.id,
      };
    case 'split': {
      let n = 0;
      const landed = landSplit(elements, note.id, change, {
        inertIds,
        makeId: () => `offered-part-${(n += 1)}`,
      });
      const after = new Map(landed.elements.map((el) => [el.id, el]));
      const shiftX = new Map<ElementId, number>();
      for (const el of elements) {
        const next = after.get(el.id);
        if (next && isBoxed(el) && isBoxed(next) && next.x !== el.x)
          shiftX.set(el.id, next.x - el.x);
      }
      const kind = eventStormingKindOf(note)!;
      return {
        elements: elements.map((el) =>
          el.id === note.id ? { ...note, label: change.parts[0]! } : el,
        ),
        parts: landed.partIds.map((id) => {
          const part = after.get(id) as StickyElement;
          return { id, kind, words: part.label ?? '', spot: boxOf(part) };
        }),
        shiftX,
        struck: null,
        board: null,
      };
    }
  }
}

function namePreview(
  elements: Element[],
  key: Extract<PreviewedChange, { type: 'name' }>,
): OfferedPreview | null {
  const suggested = nameSuggestionsFor(elements, key.contextIds).find((s) =>
    sameContextName(s.name, key.name),
  );
  if (!suggested) return null;
  // A merge's name is told by its caption: the selected outlines already show what would merge.
  if (key.contextIds.length > 1) return plain(elements);
  return plain(renameContext(elements, key.contextIds[0]!, suggested.name));
}

const boardPreview = (board: BoardOffer | null): OfferedPreview | null =>
  board && { ...plain(board.elements), board };

/** The preview a key asks for; null when the key names no suggested change that is still there, one on a note
 *  that may not change (locked, or on a hidden or locked layer), or a board the check would not rearrange. */
export function offeredPreview(
  elements: Element[],
  previewKey: string | null,
  inertIds: ReadonlySet<ElementId>,
  layers?: Layer[],
): OfferedPreview | null {
  const key = parsePreviewKey(previewKey);
  if (key?.type === 'change') return changePreview(elements, key, inertIds);
  if (key?.type === 'lane-plan')
    return boardPreview(lanePlanOffer({ elements, layers }, key.planId));
  if (key?.type === 'arrange') return boardPreview(arrangeOffer({ elements, layers }));
  if (key?.type === 'term') {
    // A renamed term draws its new words on every note and context name the rename reaches
    // (docs/specs/021-event-storming/board-language.md "The Language tab"); nothing when it would change nothing.
    const renamed = renameTerm(elements, key.from, key.to, key.scope, inertIds);
    return renamed === elements ? null : plain(renamed);
  }
  // Contexts brought forward (a Names or a Merge row pointed at) change nothing that is drawn.
  return key?.type === 'name' ? namePreview(elements, key) : null;
}
