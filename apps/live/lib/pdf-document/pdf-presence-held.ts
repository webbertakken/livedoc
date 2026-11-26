// What a person holds in a PDF, both ways (docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence"):
// ours, the first mark selected, else the text selected, while focus is within the surface, and never a Viewer's; a
// collaborator's, the mark they hold where it lies on a page, or their text selection on a page.
import type { PdfPresenceHeld } from '@livedoc/api-schema';
import type { Mark, TextSpan } from '@livedoc/pdf-documents';
import type { PdfPresencePeer } from './pdf-presence-store';
import type { PdfMarksChosen } from './usePdfMarkSelection';

/** The text selected, on its page by name: a column's spans travel as their outer range. */
export type PdfHeldText = { readonly page: string; readonly spans: readonly TextSpan[] };

/** What this person holds: the mark given the keys, else the text selected; nothing for a Viewer or out of focus. */
export function heldOf({
  chosen,
  text,
  focused,
  reviews,
}: {
  chosen: PdfMarksChosen | null;
  text: PdfHeldText | null;
  focused: boolean;
  // The session reviews: a Viewer holds nothing.
  reviews: boolean;
}): PdfPresenceHeld | null {
  if (!focused || !reviews) return null;
  const first = chosen?.ids[0];
  if (first) return { what: 'mark', name: first };
  const from = text?.spans[0];
  const to = text?.spans.at(-1);
  return text && from && to && to[1] > from[0]
    ? { what: 'text', page: text.page, first: from[0], last: to[1] - 1 }
    : null;
}

/** A collaborator holding a mark of a page, and the mark as the page has it. */
export type PdfPeerHold = {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly mark: Mark;
};

/** A collaborator's text selection on a page: its first and last character. */
export type PdfPeerText = {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly first: number;
  readonly last: number;
};

const NO_HOLDS: readonly PdfPeerHold[] = [];
const NO_TEXTS: readonly PdfPeerText[] = [];

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

/** The collaborators whose text selection is on the page named `page`. */
export function peerTextsOn(
  peers: readonly PdfPresencePeer[],
  page: string,
): readonly PdfPeerText[] {
  const texts = peers.flatMap((peer) => {
    const held = peer.place.held;
    return held?.what === 'text' && held.page === page
      ? [{ id: peer.id, name: peer.name, color: peer.color, first: held.first, last: held.last }]
      : [];
  });
  return texts.length === 0 ? NO_TEXTS : texts;
}
