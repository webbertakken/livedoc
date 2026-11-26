// The person's own documents for a picker (Copy To's spreadsheets, docs/specs/029-sheets/spreadsheet.md D183; Compare
// documents' text documents, docs/specs/034-text-documents/review.md "The dialog"): listed once, narrowed by `pick`,
// loading, failed (with a retry) or ready; a late answer after unmounting is dropped.
import { useEffect, useRef, useState } from 'react';
import type { DocumentSummary } from '@livedoc/api-schema';
import { apiListDocuments } from '@/lib/api/documents';
import { debugLog } from '@/lib/debug-log';

export type OwnDocuments =
  { state: 'loading' } | { state: 'failed' } | { state: 'ready'; documents: DocumentSummary[] };

export function useOwnDocuments(
  ownerId: string,
  pick: (documents: readonly DocumentSummary[]) => DocumentSummary[],
  /** Names the picker in the log of a failed list. */
  what: string,
): { listing: OwnDocuments; retry: () => void } {
  const [listing, setListing] = useState<OwnDocuments>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const picked = useRef(pick);
  useEffect(() => {
    picked.current = pick;
  }, [pick]);
  useEffect(() => {
    let live = true;
    apiListDocuments(ownerId).then(
      (documents) => {
        if (live) setListing({ state: 'ready', documents: picked.current(documents) });
      },
      (error: unknown) => {
        debugLog(`[${what}] list failed`, { error: String(error) });
        if (live) setListing({ state: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [ownerId, attempt, what]);
  const retry = () => {
    setListing({ state: 'loading' });
    setAttempt((n) => n + 1);
  };
  return { listing, retry };
}
