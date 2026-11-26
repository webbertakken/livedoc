// What a person holds in a PDF, both ways (docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence"):
// ours, the first mark selected while focus is within the surface; a collaborator's, the mark they hold where it lies
// on a page. A Viewer selects no mark, so holds nothing.
import type { Mark } from '@livedoc/pdf-documents';
import type { PdfPresencePeer } from './pdf-presence-store';
import type { PdfMarksChosen } from './usePdfMarkSelection';

/** What this person holds: the mark given the keys, while focus is within the surface; else nothing. */
export function heldOf(
  chosen: PdfMarksChosen | null,
  focused: boolean,
): { what: 'mark'; name: string } | null {
  const first = chosen?.ids[0];
  return focused && first ? { what: 'mark', name: first } : null;
}

/** A collaborator holding a mark of a page, and the mark as the page has it. */
export type PdfPeerHold = {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly mark: Mark;
};

const NO_HOLDS: readonly PdfPeerHold[] = [];

/** The collaborators holding one of `marks` (a page's), each with the mark; a name the page lacks places nobody. */
export function peerHoldsOn(
  peers: readonly PdfPresencePeer[],
  marks: readonly Mark[],
): readonly PdfPeerHold[] {
  const holds = peers.flatMap((peer) => {
    const held = peer.place.held;
    if (held?.what !== 'mark') return [];
    const mark = marks.find((one) => one.id === held.name);
    return mark ? [{ id: peer.id, name: peer.name, color: peer.color, mark }] : [];
  });
  return holds.length === 0 ? NO_HOLDS : holds;
}
