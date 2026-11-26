'use client';

// A person's stamp identity (docs/specs/035-pdf-documents/marks.md "Stamps"): their title, organisation, unit and
// email, kept in their preferences so it follows the account, a guest's this browser's, read live from wherever it is
// changed. Each field kept is counted before it is kept; a field stored too long is refused by name and read as not
// set; one that could not be kept is said, and still used while this PDF is open.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StampIdentity, type StampIdentityField } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import {
  PREFERENCES_CHANGED_EVENT,
  readUserPreferences,
  writeUserPreferences,
} from '@/lib/user-preferences';

/** "Errors": said when a field could not be kept. */
export const STAMP_IDENTITY_NOT_SAVED_COPY =
  'Your identity couldn’t be saved. It applies until you close this PDF.';

/** Each field as telemetry names it: `StampIdentity.<Field>`, never its words. */
const FIELD_NAMES: Readonly<Record<StampIdentityField, string>> = {
  title: 'Title',
  organisation: 'Organisation',
  unit: 'Unit',
  email: 'Email',
};

function subscribe(changed: () => void): () => void {
  window.addEventListener(PREFERENCES_CHANGED_EVENT, changed);
  window.addEventListener('storage', changed);
  return () => {
    window.removeEventListener(PREFERENCES_CHANGED_EVENT, changed);
    window.removeEventListener('storage', changed);
  };
}
// The stored identity as text: a snapshot that is the same while nothing changed.
const stored = (): string => JSON.stringify(readUserPreferences().pdfStampIdentity ?? null);
const notOnTheServer = (): string => 'null';

export type PdfStampIdentity = {
  // The identity a dynamic stamp placed now is given.
  readonly identity: StampIdentity;
  // Keeps one field; what to say where it could not be kept, else null.
  readonly keep: (field: StampIdentityField, text: string) => string | null;
};

export function usePdfStampIdentity({
  ownerId,
}: {
  // The person: their preferences sync to their account, or to this browser.
  ownerId: string | null;
}): PdfStampIdentity {
  const kept = useSyncExternalStore(subscribe, stored, notOnTheServer);
  const read = useMemo(() => StampIdentity.read(JSON.parse(kept)), [kept]);
  // An identity that could not be kept still applies while this PDF is open.
  const [unkept, setUnkept] = useState<StampIdentity | null>(null);

  useEffect(() => {
    for (const { field, reason } of read.refused)
      debugLog(`[pdf] stamp-identity-refused reason=${reason} field=${field}`);
  }, [read]);

  const identity = unkept ?? read.identity;
  const keep = useCallback(
    (field: StampIdentityField, text: string): string | null => {
      const next = StampIdentity.set(identity, field, text);
      // Counted before it is kept, as every setting's change is.
      track('Pdf', 'Changed', `StampIdentity.${FIELD_NAMES[field]}`);
      debugLog(`[pdf] stamp-identity-changed field=${field} set=${next[field] ? 'yes' : 'no'}`);
      writeUserPreferences({ ...readUserPreferences(), pdfStampIdentity: next }, ownerId);
      if (stored() === JSON.stringify(next)) {
        setUnkept(null);
        return null;
      }
      debugLog('[pdf] stamp-identity-not-saved');
      setUnkept(next);
      return STAMP_IDENTITY_NOT_SAVED_COPY;
    },
    [identity, ownerId],
  );

  return useMemo(() => ({ identity, keep }), [identity, keep]);
}
