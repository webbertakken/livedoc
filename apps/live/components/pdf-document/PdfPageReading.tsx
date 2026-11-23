'use client';

// A page's text for assistive technology (docs/specs/035-pdf-documents/accessibility.md "The accessible tree"): while
// the page is near view, its text in the file's order as paragraphs, joined exactly as Copy joins a whole page and
// read from the same page texts the selection uses, so the two never disagree. Hidden from sight; gone with the page's
// picture, so a long file's tree stays small.
import { useEffect, useState } from 'react';
import { TextRange } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import type { PdfPageTexts } from '@/lib/pdf-document/pdf-page-texts';

/** A page's landmark name: its number of the count, with the file's own label where it gives one. */
export const pageRegionName = (index: number, count: number, label: string | null): string =>
  `Page ${index + 1} of ${count}${label ? ` (${label})` : ''}`;

export function PdfPageReading({
  index,
  texts,
  wanted,
}: {
  index: number;
  texts: PdfPageTexts | null;
  /** Whether the page is near view. */
  wanted: boolean;
}) {
  const [read, setRead] = useState<{ from: PdfPageTexts; paragraphs: string[] } | null>(null);

  useEffect(() => {
    if (!wanted || !texts) return;
    let gone = false;
    void texts.read(index).then((page) => {
      if (gone) return;
      const paragraphs = page ? TextRange.paragraphs(page) : [];
      const source = paragraphs.length > 0 ? 'geometry' : 'none';
      debugLog(`[pdf] tree source=${source} page=${index + 1} nodes=${paragraphs.length}`);
      setRead({ from: texts, paragraphs });
    });
    return () => {
      gone = true;
      setRead(null);
    };
  }, [index, texts, wanted]);

  const paragraphs = wanted && read?.from === texts ? read.paragraphs : [];
  if (paragraphs.length === 0) return null;
  return (
    <div className="sr-only">
      {paragraphs.map((paragraph, at) => (
        <p key={at}>{paragraph}</p>
      ))}
    </div>
  );
}
