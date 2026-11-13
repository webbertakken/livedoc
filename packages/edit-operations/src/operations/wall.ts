// `wall` (docs/specs/021-event-storming/event-storming.md Phase 11 "Through the CLI and the MCP"): the notes read off
// several photos of one wall, in wall order, stitched against the board exactly as the editor stitches them, and
// landed as a DRAFT: the person sees the ordinary draft bar and adds or discards it. JSON form only.

import { PHOTO_MAX_NOTES, type EditRejection } from '@livedoc/api-schema';
import {
  EVENT_STORMING_NOTES,
  WALL_MAX_PHOTOS,
  boardNotesOfElements,
  draftNotesOf,
  eventStormingNoteFields,
  isEventStormingTab,
  stitchWall,
  type Element,
  type EventStormingNoteKind,
  type PhotoNote,
} from '@livedoc/document';
import { mintId } from '../ids';
import { currentElements, putElement, type EditState } from '../state';
import type { WallOperation, WallPhotoInput } from '../types';

const KINDS: readonly string[] = EVENT_STORMING_NOTES.map((n) => n.kind);

const refusal = (
  code: EditRejection['code'],
  operation: number,
  details: string[],
  hint?: string,
): EditRejection => ({ code, operation, details, ...(hint ? { hint } : {}) });

// A photo's notes as the stitching reads them: centres and sizes as fractions of the photo's width.
function photoNotesOf(photo: WallPhotoInput): PhotoNote[] {
  return photo.notes.map((n, i) => ({
    id: i,
    text: (n.words ?? '').trim().replace(/\s+/g, ' '),
    kind: KINDS.includes(n.kind ?? '') ? (n.kind as EventStormingNoteKind) : 'unknown',
    size: 'square',
    cx: (n.x + n.w / 2) / photo.width,
    cy: (n.y + n.h / 2) / photo.width,
    w: n.w / photo.width,
    h: n.h / photo.width,
    row: 0,
    order: i,
  }));
}

export function applyWall(
  state: EditState,
  op: WallOperation,
  operation: number,
): EditRejection | null {
  if (!isEventStormingTab(state.tab))
    return refusal('not_event_storming', operation, ['a wall goes on an Event Storming board']);
  if (op.photos.length > WALL_MAX_PHOTOS)
    return refusal('too_large', operation, [
      `${op.photos.length} photos; at most ${WALL_MAX_PHOTOS} in one import`,
    ]);
  const crowded = op.photos.findIndex((p) => p.notes.length > PHOTO_MAX_NOTES);
  if (crowded >= 0)
    return refusal('too_large', operation, [
      `photo ${crowded + 1} holds ${op.photos[crowded]!.notes.length} notes; at most ${PHOTO_MAX_NOTES}`,
    ]);
  const elements = [...currentElements(state)];
  if (draftNotesOf(elements).length > 0)
    return refusal(
      'draft_open',
      operation,
      ['the board already holds a draft from a photo'],
      'a person adds or discards it first',
    );

  const stitched = stitchWall(op.photos.map(photoNotesOf), boardNotesOfElements(elements));
  if (stitched.additions.length === 0)
    return refusal('nothing_to_add', operation, [
      `every note is already on the board (${stitched.matches.length} matched)`,
    ]);
  for (const a of stitched.additions) {
    const id = mintId(state, a.text, 'sticky');
    const el: Element = {
      id,
      type: 'sticky',
      ...eventStormingNoteFields(a.kind),
      x: Math.round(a.x),
      y: Math.round(a.y),
      label: a.text,
      esDraft: true,
    };
    putElement(state, el, operation);
    state.created.push(id);
  }
  state.log('[edit-ops] wall', {
    operation,
    photos: op.photos.length,
    added: stitched.additions.length,
    matched: stitched.matches.length,
    seenAgain: stitched.seenAgain.length,
  });
  return null;
}
