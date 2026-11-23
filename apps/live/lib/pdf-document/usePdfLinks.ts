'use client';

// Following a PDF's links and bookmarks (docs/specs/035-pdf-documents/reading-surface.md "Following a link"): a place
// in the document is gone to at once; everything else is asked about or said in the link dialog, never followed
// unasked.
import { useCallback, useState } from 'react';
import type { LinkTarget, PageInfo } from '@livedoc/pdf-documents';
import type { PdfLinkAsked } from '@/components/pdf-document/PdfLinkDialog';
import { debugLog } from '@/lib/debug-log';
import { pdfLinkOutcome } from './pdf-link';

export function usePdfLinks(pages: readonly PageInfo[], goToPage: (index: number) => void) {
  const [asked, setAsked] = useState<PdfLinkAsked | null>(null);
  const follow = useCallback(
    (target: LinkTarget | null) => {
      const outcome = pdfLinkOutcome(
        target,
        pages.map((page) => page.name),
      );
      if (outcome.kind === 'go') return goToPage(outcome.index);
      if (outcome.kind !== 'ask') debugLog(`[pdf] link-refused kind=${outcome.kind}`);
      if (outcome.kind !== 'nowhere') setAsked(outcome);
    },
    [pages, goToPage],
  );
  const close = useCallback(() => setAsked(null), []);
  return { follow, asked, close };
}
