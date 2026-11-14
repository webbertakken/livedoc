// `arrange` (docs/specs/021-event-storming/arrange.md "How an agent arranges"): the board laid out afresh along the
// timeline, a column per event, every note kept on its lane. It is no suggestion: the board works the result out and
// checks it, so it is written at once, revertable as one changeset.

import type { EditRejection } from '@livedoc/api-schema';
import type { ElementId } from '@livedoc/document';
import { arrangeBoard } from '@livedoc/storm-reading';
import { currentElements, moveElement, refsOf, type EditState } from '../state';
import { notABoard, refusal } from './suggestion-rules';
import { readingChangesRefusal } from './suggest-lane';

export function applyArrange(state: EditState, operation: number): EditRejection | null {
  const board = notABoard(state, operation, 'arranging');
  if (board) return board;
  const before = currentElements(state);
  const arranged = arrangeBoard({ elements: [...before], layers: state.tab.layers });
  if (arranged.ok) {
    let notes = 0;
    arranged.elements.forEach((el, i) => {
      if (el === before[i]) return;
      moveElement(state, el, operation, 'arranged');
      notes += 1;
    });
    state.log('[edit-ops] arranged', {
      operation,
      notes,
      gap: arranged.gap,
      gained: arranged.gained,
    });
    return null;
  }
  const ref = (id: ElementId) => refsOf(state).refOf(id);
  switch (arranged.why) {
    case 'no_events':
      return refusal(
        'nothing_to_arrange',
        operation,
        ['no events yet: arranging follows the timeline'],
        'add the domain events first',
      );
    case 'already':
      return refusal('nothing_to_arrange', operation, ['the board is arranged already']);
    case 'blocked':
      return refusal(
        'lane_blocked',
        operation,
        [`a note would land on ${arranged.blocked.map(ref).join(', ')}, which stays where it is`],
        'a locked or free-placed note is in the way: a person can move or unlock it',
      );
    case 'reading_changes':
      return readingChangesRefusal(
        state,
        arranged.changes,
        operation,
        'no spacing keeps what the board says: move these notes by hand, nearer the note they relate to',
      );
  }
}
