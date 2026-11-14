// `suggest-lane "<name>" [lanes=<n>,…] [kind=<kind>,…] [context=<context>,…] [<note>…] [reason=…]`
// (docs/specs/021-event-storming/lane-plans.md "How an agent suggests one"): one lane of a lane plan. The lines of
// one changeset, top to bottom, make one plan, settled after the last operation against the board the changeset
// leaves: the board resolves which notes each line takes, places them and checks that it would say the same. The
// plan is kept as an element; no note moves until a person applies it.

import type { EditRejection } from '@livedoc/api-schema';
import {
  eventStormingKindOf,
  EVENT_STORMING_NOTES,
  isCandidateContext,
  LANE_NAME_MAX,
  LANES_MAX,
  LANES_MIN,
  newLanePlanElement,
  openLanePlan,
  type Element,
  type ElementId,
  type EventStormingNoteKind,
  type StickyElement,
  type Tab,
} from '@livedoc/document';
import {
  checkLanePlan,
  READING_CHANGES_SHOWN,
  resolveLaneLines,
  sayReadingChange,
  type LaneRefusal,
  type ReadingChange,
} from '@livedoc/storm-reading';
import { newElementId } from '../ids';
import { resolveOne } from '../selectors';
import {
  currentElements,
  putElement,
  refsOf,
  refuseLocked,
  removeElement,
  type EditState,
  type PendingLaneLine,
} from '../state';
import type { SuggestLaneOperation } from '../types';
import { boardFull, notABoard, reasonTooLong, refusal, tidy, whyAndWho } from './suggestion-rules';

const KINDS = EVENT_STORMING_NOTES.map((n) => n.kind);
// How many notes a `lanes_incomplete` refusal names.
export const LANES_INCOMPLETE_SHOWN = 10;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The elements the selectors name, each once, as ids; the first refusal otherwise.
function resolveIds(
  state: EditState,
  selectors: readonly string[],
  operation: number,
  refuse: (el: Element) => EditRejection | null,
): ElementId[] | EditRejection {
  const ids: ElementId[] = [];
  for (const selector of selectors) {
    const resolved = resolveOne(state, selector, operation);
    if ('rejection' in resolved) return resolved.rejection;
    const refused = refuse(resolved.el);
    if (refused) return refused;
    if (!ids.includes(resolved.el.id)) ids.push(resolved.el.id);
  }
  return ids;
}

export function applySuggestLane(
  state: EditState,
  op: SuggestLaneOperation,
  operation: number,
): EditRejection | null {
  const board = notABoard(state, operation, 'lane plans');
  if (board) return board;
  const name = tidy(op.name);
  if (!name) return refusal('name_required', operation, ['a lane needs a name']);
  if (name.length > LANE_NAME_MAX)
    return refusal('name_too_long', operation, [
      `the name is ${name.length} characters; at most ${LANE_NAME_MAX}`,
    ]);
  const long = reasonTooLong(op.reason, operation);
  if (long) return long;
  const unknown = (op.kinds ?? []).find((kind) => !KINDS.includes(kind as EventStormingNoteKind));
  if (unknown !== undefined)
    return refusal('invalid_kind', operation, [
      `"${unknown}" is not a note kind`,
      `kinds: ${KINDS.join(', ')}`,
    ]);
  const lanes = op.lanes ?? [];
  const below = lanes.find((n) => n < 1);
  if (below !== undefined)
    return refusal('lanes_out_of_range', operation, [
      `no lane ${below}: lanes are numbered from 1, as the storm view prints them`,
    ]);

  const ref = (id: ElementId) => refsOf(state).refOf(id);
  const contexts = resolveIds(state, op.contexts ?? [], operation, (el) =>
    isCandidateContext(el)
      ? null
      : refusal(
          'not_a_context',
          operation,
          [`${ref(el.id)} is not a candidate context`],
          'the storm view lists the contexts, kept and suggested, with their refs',
        ),
  );
  if (!Array.isArray(contexts)) return contexts;
  const notes = resolveIds(state, op.notes ?? [], operation, (el) => {
    if (el.type !== 'sticky' || eventStormingKindOf(el) === null)
      return refusal('note_not_a_note', operation, [`${ref(el.id)} is not a workshop note`]);
    // A plan leaves a locked note where it is, so naming one is refused as any change to it is.
    const lock = state.locked.get(el.id);
    return lock ? refuseLocked(state, 'suggest-lane', operation, el, lock) : null;
  });
  if (!Array.isArray(notes)) return notes;

  state.laneLines.push({
    operation,
    name,
    lanes,
    kinds: (op.kinds ?? []) as EventStormingNoteKind[],
    contexts,
    notes,
    ...(op.reason ? { reason: op.reason } : {}),
  });
  return null;
}

/** The refusal for a board that would say something else, naming the first changes. */
export function readingChangesRefusal(
  state: EditState,
  changes: readonly ReadingChange[],
  operation: number,
  hint: string,
): EditRejection {
  const byId = new Map(currentElements(state).map((el) => [el.id, el]));
  const ref = (id: ElementId) => refsOf(state).refOf(id);
  const kindOf = (id: ElementId) => eventStormingKindOf(byId.get(id) as StickyElement)!;
  const more = changes.length - READING_CHANGES_SHOWN;
  return refusal(
    'reading_changes',
    operation,
    [
      ...changes
        .slice(0, READING_CHANGES_SHOWN)
        .map((change) => sayReadingChange(change, (id) => `${ref(id)} (${kindOf(id)})`, ref)),
      ...(more > 0 ? [`and ${more} more`] : []),
    ],
    hint,
  );
}

function resolveRefusal(
  state: EditState,
  lines: readonly PendingLaneLine[],
  refused: LaneRefusal,
): EditRejection {
  const ref = (id: ElementId) => refsOf(state).refOf(id);
  const first = lines[0]!.operation;
  switch (refused.code) {
    case 'lanes_out_of_range':
      return refusal(
        'lanes_out_of_range',
        first,
        [`${plural(refused.count, 'lane')}; a plan has ${LANES_MIN} to ${LANES_MAX}`],
        'one suggest-lane line per lane, top to bottom, in one changeset',
      );
    case 'lane_not_found':
      return refusal(
        'lane_not_found',
        lines[refused.line]!.operation,
        [`no lane ${refused.lane}: the board has lanes 1 to ${refused.lanes}`],
        'the storm view numbers the lanes in use, top to bottom',
      );
    case 'lane_blocked':
      return refusal(
        'lane_blocked',
        lines[refused.line]!.operation,
        [`${ref(refused.note)} is placed free of the lanes: a plan leaves it where it is`],
        'leave it out of the line',
      );
    case 'lane_empty':
      return refusal(
        'lane_empty',
        lines[refused.line]!.operation,
        [`the lane "${lines[refused.line]!.name}" takes no note`],
        'say what it holds: lanes=, kind=, context= or notes by ref; a more specific line took what it named',
      );
    case 'lanes_incomplete': {
      const shown = refused.notes.slice(0, LANES_INCOMPLETE_SHOWN).map(ref).join(', ');
      const more = refused.notes.length - LANES_INCOMPLETE_SHOWN;
      return refusal(
        'lanes_incomplete',
        first,
        [
          `${plural(refused.notes.length, 'note')} ${refused.notes.length === 1 ? 'is' : 'are'} on no lane: ${shown}${more > 0 ? ` and ${more} more` : ''}`,
        ],
        'every workshop note goes on a lane: add them to a line, or add a line for them',
      );
    }
  }
}

/** After the last operation: the changeset's lane lines as one plan, or the refusal. Null with no lane lines. */
export function settleLanePlan(state: EditState): EditRejection | null {
  const lines = state.laneLines;
  if (lines.length === 0) return null;
  const first = lines[0]!.operation;
  const elements = [...currentElements(state)];
  const tab: Pick<Tab, 'elements' | 'layers'> = { elements, layers: state.tab.layers };
  const ref = (id: ElementId) => refsOf(state).refOf(id);

  const resolved = resolveLaneLines(tab, lines);
  if ('refusal' in resolved) return resolveRefusal(state, lines, resolved.refusal);
  const verdict = checkLanePlan(tab, resolved);
  if (!verdict.ok) {
    // The lines took exactly the notes a plan holds, so a plan just resolved is never stale.
    if (verdict.why === 'reading_changes')
      return readingChangesRefusal(
        state,
        verdict.changes,
        first,
        'a note stays within two lanes of the note it relates to, and events keep their order: change the lanes',
      );
    return refusal(
      'lane_blocked',
      first,
      [
        `a note would land on ${(verdict as { blocked: ElementId[] }).blocked.map(ref).join(', ')}, which stays where it is`,
      ],
      'a locked or free-placed note is in the way: try other lanes',
    );
  }

  const open = openLanePlan(elements);
  if (!open) {
    const full = boardFull(state, first);
    if (full) return full;
  }
  const id = newElementId(state, { label: 'lane plan', kind: 'shape' }, first) as string;
  const reason = lines.find((line) => line.reason)?.reason;
  const held = new Set(resolved.lanes.flatMap((lane) => lane.notes));
  const plan = newLanePlanElement({
    id,
    plan: { lanes: resolved.lanes, ...whyAndWho(state, reason) },
    notes: elements.filter((el): el is StickyElement => held.has(el.id)),
  });
  // One open plan a board: the new one replaces it.
  for (const el of elements)
    if (el.id !== id && el.type === 'shape' && el.esLanePlan)
      removeElement(state, el.id, first, {});
  putElement(state, plan, first);
  state.created.push(id);
  const gained =
    verdict.gained > 0
      ? `, ${plural(verdict.gained, 'loose note')} ${verdict.gained === 1 ? 'finds' : 'find'} a partner`
      : '';
  state.said.set(
    id,
    `${plural(resolved.lanes.length, 'lane')}, ${plural(held.size, 'note')}; reads the same${gained}`,
  );
  state.log('[edit-ops] suggested lanes', {
    operation: first,
    lanes: resolved.lanes.length,
    notes: held.size,
    gained: verdict.gained,
  });
  return null;
}
