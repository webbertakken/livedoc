'use client';

// Compare documents against one of this document's versions (docs/specs/034-text-documents/review.md "The dialog",
// Versions): the versions newest first, each by its name or its day and time, one to be chosen; loading, none and a
// failed list with Try again each say so.
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@livedoc/ui';
import { type OfficeVersion, versionLabel } from '@/lib/office/office-version-list';
import { debugLog } from '@/lib/debug-log';

/** A version chosen to compare against: its id and how it is named. */
export type ChosenVersion = { readonly id: string; readonly name: string };

type Listing =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; versions: readonly OfficeVersion[] };

export function TextDocumentCompareVersions({
  load,
  chosen,
  onChoose,
  group,
  now,
}: {
  load: () => Promise<readonly OfficeVersion[]>;
  chosen: ChosenVersion | null;
  onChoose: (version: ChosenVersion) => void;
  /** The radio group's name. */
  group: string;
  now: number;
}) {
  const [listing, setListing] = useState<Listing>({ state: 'loading' });
  const read = useCallback(() => {
    let live = true;
    load().then(
      (versions) => {
        if (live)
          setListing({
            state: 'ready',
            versions: [...versions].sort((a, b) => b.takenAt - a.takenAt),
          });
      },
      (error: unknown) => {
        debugLog('[text-document] compare versions unread', { error: String(error) });
        if (live) setListing({ state: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [load]);
  useEffect(read, [read]);

  if (listing.state === 'loading')
    return (
      <p role="status" className="text-body text-slate-600 dark:text-slate-300">
        Loading this document’s versions…
      </p>
    );
  if (listing.state === 'failed')
    return (
      <div
        role="alert"
        className="flex items-center gap-3 text-body text-slate-700 dark:text-slate-200"
      >
        <span>This document’s versions could not be listed.</span>
        <Button
          variant="secondary"
          size="xs"
          onClick={() => {
            setListing({ state: 'loading' });
            read();
          }}
        >
          Try again
        </Button>
      </div>
    );
  if (listing.versions.length === 0)
    return (
      <p className="text-body text-slate-600 dark:text-slate-300">
        This document has no versions yet.
      </p>
    );
  return (
    <fieldset className="max-h-64 overflow-y-auto rounded-menu border border-slate-200 dark:border-slate-700">
      <legend className="sr-only">This document’s versions</legend>
      {listing.versions.map((v) => {
        const name = versionLabel(v, now);
        return (
          <label
            key={v.id}
            className="flex min-h-row cursor-pointer items-center gap-2 px-3 text-body text-slate-700 hover:bg-slate-50 pointer-coarse:min-h-11 dark:text-slate-200 dark:hover:bg-slate-800/60"
          >
            <input
              type="radio"
              name={group}
              checked={chosen?.id === v.id}
              onChange={() => onChoose({ id: v.id, name })}
            />
            <span className={`truncate ${v.kind === 'named' ? 'font-medium' : ''}`}>{name}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
