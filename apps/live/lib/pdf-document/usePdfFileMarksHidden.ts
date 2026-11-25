'use client';

// The file's own marks the pages are drawn without (docs/specs/035-pdf-documents/marks.md "Changing a mark"): each one
// deleted, or taken as LiveDoc's and drawn over the page as LiveDoc draws its kind. Whoever changed it, the engine is
// told, and then the key changes, so the pages, tiles and thumbnails drawn before are drawn again.
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import type { PdfEngine } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { fileMarksGone } from './pdf-changeable-marks';

/** The ids the pages are drawn without, as one key: empty while they are drawn with every mark of the file. */
export function usePdfFileMarksHidden(
  engine: Pick<PdfEngine, 'hideMarks'> | null,
  doc: Y.Doc | null,
): string {
  const [key, setKey] = useState('');
  useEffect(() => {
    if (!engine || !doc) return;
    const removed = doc.getMap('removed');
    let told = '';
    let gone = false;
    const tell = () => {
      const ids = fileMarksGone(doc).toSorted();
      const next = ids.join(' ');
      if (next === told) return;
      told = next;
      void engine.hideMarks(ids).then(
        () => {
          if (!gone) setKey(next);
        },
        (error: unknown) => debugLog(`[pdf] marks-hidden-failed reason=${String(error)}`),
      );
    };
    tell();
    removed.observeDeep(tell);
    return () => {
      gone = true;
      removed.unobserveDeep(tell);
    };
  }, [engine, doc]);
  return key;
}
