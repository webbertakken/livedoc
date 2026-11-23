'use client';

// Following a PDF's links and bookmarks (docs/specs/035-pdf-documents/reading-surface.md "Following a link"): a place
// in the document is gone to at once, its point at the view's top left where the file names one, reckoned through
// the page's matrix; everything else is asked about or said in the link dialog, never followed unasked.
import { useCallback, useState } from 'react';
import type { LinkTarget, PageInfo, PageTurns, PdfEngine } from '@livedoc/pdf-documents';
import type { PdfLinkAsked } from '@/components/pdf-document/PdfLinkDialog';
import { debugLog } from '@/lib/debug-log';
import { pdfLinkOutcome, placeOnPage } from './pdf-link';
import { PdfView } from './pdf-view';
import type { PdfSpot } from './usePdfView';

export function usePdfLinks({
  pages,
  turns,
  engine,
  goTo,
}: {
  pages: readonly PageInfo[];
  // Rotate view's turn: a place is reckoned on the page as it shows.
  turns: PageTurns;
  engine: Pick<PdfEngine, 'pageMatrix'> | null;
  // Goes to a page, or a place on it (a jump: Previous view comes back).
  goTo: (index: number, at?: PdfSpot) => void;
}) {
  const [asked, setAsked] = useState<PdfLinkAsked | null>(null);
  const follow = useCallback(
    (target: LinkTarget | null) => {
      const outcome = pdfLinkOutcome(
        target,
        pages.map((page) => page.name),
      );
      if (outcome.kind === 'go') {
        const { index } = outcome;
        if ((outcome.x === null && outcome.y === null) || !engine) return goTo(index);
        void engine.pageMatrix(index, turns).then((matrix) => {
          const shown = PdfView.sizeTurned(pages[index]!, turns);
          goTo(index, matrix ? placeOnPage(matrix, shown, outcome) : undefined);
        });
        return;
      }
      if (outcome.kind !== 'ask') debugLog(`[pdf] link-refused kind=${outcome.kind}`);
      if (outcome.kind !== 'nowhere') setAsked(outcome);
    },
    [pages, turns, engine, goTo],
  );
  const close = useCallback(() => setAsked(null), []);
  return { follow, asked, close };
}
