'use client';

// A drag across one page's text with a text tool in hand (docs/specs/035-pdf-documents/marks.md "Making a mark"): the
// text under the drag shown as it goes, asked of the engine one place at a time so the latest place always follows,
// and the text it covered handed over to be marked once let go.
import { useRef, useState } from 'react';
import type { PagePoint, PdfEngine, Quad, TextSelection } from '@livedoc/pdf-documents';

export function usePdfPageTextMark({
  index,
  engine,
  onMark,
}: {
  index: number;
  engine: Pick<PdfEngine, 'selectText'>;
  // The text a drag covered, to mark.
  onMark: (index: number, selection: TextSelection) => void;
}) {
  const [preview, setPreview] = useState<readonly Quad[]>([]);
  const drag = useRef<{ from: PagePoint; asking: boolean; next: PagePoint | null } | null>(null);

  // The text under the drag so far, asked one at a time: the latest place always follows.
  const previewTo = (to: PagePoint) => {
    const dragging = drag.current;
    if (!dragging) return;
    if (dragging.asking) {
      dragging.next = to;
      return;
    }
    dragging.asking = true;
    void engine.selectText(index, dragging.from, to).then((selection) => {
      if (drag.current !== dragging) return;
      dragging.asking = false;
      setPreview(selection?.quads ?? []);
      const next = dragging.next;
      dragging.next = null;
      if (next) previewTo(next);
    });
  };

  return {
    preview,
    // Whether a drag is under way.
    dragging: () => drag.current !== null,
    begin: (from: PagePoint) => {
      drag.current = { from, asking: false, next: null };
    },
    move: previewTo,
    /** The drag let go at `to`, its text marked; or, `to` null, let go unmade. */
    end: (to: PagePoint | null) => {
      const dragging = drag.current;
      drag.current = null;
      setPreview([]);
      if (!dragging || !to) return;
      void engine.selectText(index, dragging.from, to).then((selection) => {
        if (selection) onMark(index, selection);
      });
    },
  };
}
