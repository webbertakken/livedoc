'use client';

// Naming and restoring a text document's versions (docs/specs/034-text-documents/review.md "Version history"): a name
// given in place on a row or from File > Version history > Name current version, removed with an empty one; Restore
// this version asked once, then the room reverts the document in one change by the restorer and the mode closes.
// Make a copy names the copy, then makes it from the version and opens it in a new browser tab. Refusals are said,
// nothing changed: in the panel, or in the dialog that asked, which stays open.
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { NAME_MAX_LENGTH, truncateName, type TextDocumentFormat } from '@livedoc/document';
import { TEXT_DOCUMENT_VERSION_NAME_MAX_CHARS } from '@livedoc/text-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { OfficeVersionWrites } from '@/components/office/review/OfficeVersionHistory';
import { CURRENT_VERSION } from '@/components/office/review/OfficeVersionHistory';
import { ApiError } from '@/lib/api/core';
import type { TextDocumentScope } from '@/lib/api/text-documents';
import {
  apiNameCurrentTextDocumentVersion,
  apiNameTextDocumentVersion,
  apiReadTextDocumentVersion,
  apiRestoreTextDocumentVersion,
  type VersionAuthorLabel,
} from '@/lib/api/text-document-versions';
import { versionTime } from '@/lib/office/office-version-list';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import {
  makeVersionCopy,
  VERSION_COPY_FAILED,
  versionCopyName,
} from '@/lib/text-document/text-document-version-copy';
import {
  NameCurrentVersionDialog,
  RestoreVersionDialog,
  VersionCopyDialog,
} from './TextDocumentVersionDialogs';

/** File > Version history > Name current version. */
export const NAME_CURRENT_VERSION = 'name-current-version';
/** A version that could not be read, named or restored (default copy). */
export const VERSION_FAILED = 'That didn’t work. Try again.';
/** Naming one more than the named versions a document keeps (default copy). */
export const NAMED_VERSIONS_FULL =
  'You can name up to 40 versions. Remove a name to name this one.';

const refusal = (error: unknown): string =>
  error instanceof ApiError && error.code === 'named_versions_full'
    ? NAMED_VERSIONS_FULL
    : VERSION_FAILED;

export function useTextDocumentVersionWrites({
  where,
  author,
  say,
  onNamed,
  onRestored,
  local: localNote,
  copying,
  open: openTab = (id) => window.open(`/document/${id}`, '_blank', 'noopener'),
  now = () => Date.now(),
}: {
  where: TextDocumentScope;
  /** A document in This Browser: no versions, the item dimmed as See version history's. */
  local: { readonly note: string; readonly hint: string } | null;
  /** The person's name and colour, as the history shows them. */
  author: VersionAuthorLabel | undefined;
  /** Says a refusal in the panel. */
  say: (status: string | null) => void;
  /** A name was given or removed: the list is read again. */
  onNamed: () => void;
  /** The document reverted: the mode closes. */
  onRestored: () => void;
  /** What Make a copy is made from: the document's name and format, and the room's state once read. */
  copying: {
    readonly documentName: string;
    readonly format: TextDocumentFormat;
    readonly state: () => Uint8Array | null;
  };
  /** Shows a document in a new browser tab. */
  open?: (documentId: string) => void;
  now?: () => number;
}): { writes: OfficeVersionWrites; actions: OfficeActions; dialogs: ReactNode } {
  const [naming, setNaming] = useState<{ error: string | null; busy: boolean } | null>(null);
  const [restoring, setRestoring] = useState<{ id: string; busy: boolean } | null>(null);
  const [copy, setCopy] = useState<{ id: string; error: string | null; busy: boolean } | null>(
    null,
  );
  const { ownerId, documentId, tabId, shareCode } = where;
  const scope = useMemo(
    () => ({ ownerId, documentId, tabId, shareCode }),
    [ownerId, documentId, tabId, shareCode],
  );

  const write = useCallback(
    async (id: string, name: string) => {
      const started = performance.now();
      if (id === CURRENT_VERSION) await apiNameCurrentTextDocumentVersion(scope, name, author);
      else await apiNameTextDocumentVersion(scope, id, name, author);
      if (name) track('Document', 'Changed', 'TextDocumentVersionNamed');
      debugLog('[text-document] version named', {
        id,
        named: name !== '',
        ms: Math.round(performance.now() - started),
      });
      onNamed();
    },
    [scope, author, onNamed],
  );

  const name = useCallback(
    (id: string, given: string) => {
      say(null);
      write(id, given).catch((error: unknown) => {
        say(refusal(error));
        debugLog('[text-document] version write failed', {
          reason: 'name',
          id,
          error: String(error),
        });
      });
    },
    [write, say],
  );

  const restore = useCallback(
    async (id: string) => {
      const started = performance.now();
      setRestoring({ id, busy: true });
      try {
        await apiRestoreTextDocumentVersion(scope, id, author);
        track('Document', 'Changed', 'TextDocumentVersionRestored');
        debugLog('[text-document] version restored', {
          id,
          ms: Math.round(performance.now() - started),
        });
        setRestoring(null);
        onRestored();
      } catch (error: unknown) {
        setRestoring(null);
        say(VERSION_FAILED);
        debugLog('[text-document] version write failed', {
          reason: 'restore',
          id,
          error: String(error),
        });
      }
    },
    [scope, author, onRestored, say],
  );

  const nameCurrent = useCallback(
    async (given: string) => {
      setNaming({ error: null, busy: true });
      try {
        await write(CURRENT_VERSION, given);
        setNaming(null);
      } catch (error: unknown) {
        setNaming({ error: refusal(error), busy: false });
        debugLog('[text-document] version write failed', {
          reason: 'name-current',
          error: String(error),
        });
      }
    },
    [write],
  );

  const makeCopy = useCallback(
    async (id: string, given: string) => {
      setCopy({ id, error: null, busy: true });
      const state = copying.state();
      const made = state
        ? await apiReadTextDocumentVersion(scope, id).then(
            (read) =>
              makeVersionCopy({
                ownerId,
                documentId,
                format: copying.format,
                state,
                snapshot: read.snapshot,
                name: given,
              }),
            (error: unknown) => {
              debugLog('[text-document] version write failed', {
                reason: 'copy',
                id,
                error: String(error),
              });
              return null;
            },
          )
        : null;
      if (!made) {
        setCopy({ id, error: VERSION_COPY_FAILED, busy: false });
        return;
      }
      setCopy(null);
      openTab(made);
    },
    [copying, scope, ownerId, documentId, openTab],
  );

  const writes = useMemo<OfficeVersionWrites>(
    () => ({
      name,
      restore: (id: string) => setRestoring({ id, busy: false }),
      copy: (id: string) => setCopy({ id, error: null, busy: false }),
      nameMax: TEXT_DOCUMENT_VERSION_NAME_MAX_CHARS,
    }),
    [name],
  );

  const actions = useMemo<OfficeActions>(
    () => ({
      [NAME_CURRENT_VERSION]: localNote
        ? { run: () => {}, disabled: true, note: localNote.note, hint: localNote.hint }
        : { run: () => setNaming({ error: null, busy: false }) },
    }),
    [localNote],
  );

  const dialogs = (
    <>
      {naming ? (
        <NameCurrentVersionDialog
          placeholder={versionTime(now())}
          maxLength={TEXT_DOCUMENT_VERSION_NAME_MAX_CHARS}
          error={naming.error}
          busy={naming.busy}
          onSave={(given) => void nameCurrent(given)}
          onClose={() => setNaming(null)}
        />
      ) : null}
      {copy ? (
        <VersionCopyDialog
          initial={truncateName(versionCopyName(copying.documentName))}
          maxLength={NAME_MAX_LENGTH}
          error={copy.error}
          busy={copy.busy}
          onCopy={(given) => void makeCopy(copy.id, given)}
          onClose={() => setCopy(null)}
        />
      ) : null}
      {restoring ? (
        <RestoreVersionDialog
          busy={restoring.busy}
          onRestore={() => void restore(restoring.id)}
          onClose={() => setRestoring(null)}
        />
      ) : null}
    </>
  );
  return { writes, actions, dialogs };
}
