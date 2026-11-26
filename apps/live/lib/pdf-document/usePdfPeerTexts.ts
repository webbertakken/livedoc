'use client';

// Collaborators' text selections on one page, drawn from the page's own text (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "Presence"): the wire says the page and the first and last character; the page's text,
// read as a selection reads it, says where they are. A range past the page's text is cut to it; one wholly past it
// draws nothing.
import { useEffect, useMemo, useState } from 'react';
import { TextRange, type PageText } from '@livedoc/pdf-documents';
import type { PdfPageTexts } from './pdf-page-texts';
import type { PdfPeerText } from './pdf-presence-held';

/** A collaborator's text selection as a page draws it. */
export type PdfPeerTextQuads = Omit<PdfPeerText, 'first' | 'last'> & {
  readonly quads: ReturnType<typeof TextRange.quads>;
};

const NONE: readonly PdfPeerTextQuads[] = [];

/** The quads of `first` to `last` on `text`, cut to its length. */
export function peerTextQuads(text: PageText, first: number, last: number) {
  const end = Math.min(last + 1, text.text.length);
  return first < end ? TextRange.quads(text, [[first, end]]) : [];
}

export function usePdfPeerTexts(
  index: number,
  texts: PdfPageTexts | null,
  held: readonly PdfPeerText[],
): readonly PdfPeerTextQuads[] {
  const [read, setRead] = useState<{
    texts: PdfPageTexts;
    index: number;
    text: PageText | null;
  } | null>(null);
  const wanted = held.length > 0;
  const known = read !== null && read.texts === texts && read.index === index;
  useEffect(() => {
    if (!texts || !wanted || known) return;
    let gone = false;
    void texts.read(index).then((text) => {
      if (!gone) setRead({ texts, index, text });
    });
    return () => {
      gone = true;
    };
  }, [texts, index, wanted, known]);
  const text = known ? read.text : null;
  return useMemo(
    () =>
      text && held.length > 0
        ? held.map(({ id, name, color, first, last }) => ({
            id,
            name,
            color,
            quads: peerTextQuads(text, first, last),
          }))
        : NONE,
    [text, held],
  );
}
