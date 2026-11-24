'use client';

// A page's text for assistive technology (docs/specs/035-pdf-documents/accessibility.md "The accessible tree"): while
// the page is near view, the file's tags where they cover the page, else its text in the file's order as paragraphs,
// joined exactly as Copy joins a whole page. Both read the same page texts the selection uses, so the tree and the
// selection never disagree. Hidden from sight; gone with the page's picture, so a long file's tree stays small.
import { useEffect, useState } from 'react';
import { PageTags, TextRange, type TagNode } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import type { PdfPageTexts } from '@/lib/pdf-document/pdf-page-texts';
import { PdfPageTags } from './PdfPageTags';

/** A page's landmark name: its number of the count, with the file's own label where it gives one. */
export const pageRegionName = (index: number, count: number, label: string | null): string =>
  `Page ${index + 1} of ${count}${label ? ` (${label})` : ''}`;

type Read = { tags: readonly TagNode[] } | { paragraphs: readonly string[] };

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
  const [read, setRead] = useState<{ from: PdfPageTexts; read: Read } | null>(null);

  useEffect(() => {
    if (!wanted || !texts) return;
    let gone = false;
    void Promise.all([texts.read(index), texts.tags(index)]).then(([page, tags]) => {
      if (gone) return;
      const reading = PageTags.read(tags, page);
      const where = `page=${index + 1}`;
      if (reading.source === 'tags') {
        debugLog(`[pdf] tree source=tags ${where} nodes=${reading.count} tags=used`);
        setRead({ from: texts, read: { tags: reading.nodes } });
        return;
      }
      const paragraphs = page ? TextRange.paragraphs(page) : [];
      const source = paragraphs.length > 0 ? 'geometry' : 'none';
      debugLog(
        `[pdf] tree source=${source} ${where} nodes=${paragraphs.length} tags=${reading.why}`,
      );
      setRead({ from: texts, read: { paragraphs } });
    });
    return () => {
      gone = true;
      setRead(null);
    };
  }, [index, texts, wanted]);

  const shown = wanted && read?.from === texts ? read.read : null;
  if (!shown) return null;
  if ('tags' in shown) {
    return (
      <div className="sr-only">
        <PdfPageTags nodes={shown.tags} />
      </div>
    );
  }
  if (shown.paragraphs.length === 0) return null;
  return (
    <div className="sr-only">
      {shown.paragraphs.map((paragraph, at) => (
        <p key={at}>{paragraph}</p>
      ))}
    </div>
  );
}
