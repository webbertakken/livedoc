'use client';

// File > Version history > See version history (docs/specs/034-text-documents/review.md "Version history"): for an
// Editor of a document stored in LiveDoc, the shell's version-history mode over the whole window, the versions listed
// and the chosen one drawn read only with what it changed. In This Browser there is no room and no versions, so the
// item is dimmed and says why. The live editor stays bound beneath it, so leaving is instant.
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as Y from 'yjs';
import type { TextDocumentVersionDto } from '@livedoc/api-schema';
import type { TextDocumentFormat } from '@livedoc/document';
import { bytesOfBase64 } from '@livedoc/text-documents/base64';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { apiLoadTextDocumentState, type TextDocumentScope } from '@/lib/api/text-documents';
import {
  apiListTextDocumentVersions,
  apiReadTextDocumentVersion,
} from '@/lib/api/text-document-versions';
import { debugLog } from '@/lib/debug-log';
import { versionAuthorship } from '@/lib/text-document/text-document-version-authorship';
import {
  snapshotOfState,
  type VersionDrawing,
} from '@/lib/text-document/text-document-version-view';
import { TextDocumentState } from '@livedoc/text-documents';
import {
  CURRENT_VERSION,
  OfficeVersionHistory,
} from '@/components/office/review/OfficeVersionHistory';
import { TextDocumentVersionView } from './TextDocumentVersionView';

/** The File menu's item. */
export const SEE_VERSION_HISTORY = 'see-version-history';
/** What a dimmed See version history says in This Browser (review.md "Version history", (default)). */
export const VERSION_HISTORY_LOCAL_NOTE = 'LiveDoc only';
export const VERSION_HISTORY_LOCAL_HINT = 'Version history is kept for documents saved in LiveDoc.';
/** A version that could not be read (default copy). */
export const VERSION_FAILED = 'That didn’t work. Try again.';

const NOBODY = versionAuthorship({ clients: {}, deletedBy: {} });

/** The current state drawn as itself: nothing added or removed. */
function currentDrawing(state: Uint8Array): VersionDrawing {
  const doc = TextDocumentState.load([state]);
  const snapshot = snapshotOfState(doc);
  doc.destroy();
  return { snapshot, previous: snapshot, authorship: NOBODY, showChanges: false };
}

function decoded(encoded: string): Y.Snapshot {
  const bytes = bytesOfBase64(encoded);
  if (!bytes) throw new Error('version snapshot: not base64');
  return Y.decodeSnapshot(bytes);
}

type Opened = {
  readonly versions: readonly TextDocumentVersionDto[] | null;
  readonly state: Uint8Array | null;
  readonly failed: boolean;
};

export function useTextDocumentVersionHistory({
  where,
  local,
  tab,
  format,
  onClosed,
  now = () => Date.now(),
}: {
  where: TextDocumentScope;
  /** A document in This Browser, which keeps no versions. */
  local: boolean;
  /** The document tab being read. */
  tab: string;
  format: TextDocumentFormat;
  /** The mode left: the writing takes the keyboard again. */
  onClosed: () => void;
  now?: () => number;
}): { actions: OfficeActions; mode: ReactNode; open: boolean } {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState<Opened>({ versions: null, state: null, failed: false });
  const [selected, setSelected] = useState(CURRENT_VERSION);
  const [drawing, setDrawing] = useState<VersionDrawing | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // The newest ask wins: an answer to an older one is dropped.
  const asked = useRef(0);
  const { ownerId, documentId, tabId, shareCode } = where;

  const load = useCallback(() => {
    const ask = ++asked.current;
    const started = performance.now();
    const scope = { ownerId, documentId, tabId, shareCode };
    setOpened({ versions: null, state: null, failed: false });
    setSelected(CURRENT_VERSION);
    setDrawing(null);
    setStatus(null);
    Promise.all([apiListTextDocumentVersions(scope), apiLoadTextDocumentState(scope)]).then(
      ([versions, state]) => {
        if (ask !== asked.current) return;
        setOpened({ versions, state, failed: false });
        setDrawing(currentDrawing(state));
        debugLog('[text-document] version history opened', {
          versions: versions.length,
          ms: Math.round(performance.now() - started),
        });
      },
      (error: unknown) => {
        if (ask !== asked.current) return;
        setOpened({ versions: null, state: null, failed: true });
        debugLog('[text-document] version history failed', {
          reason: 'load',
          error: String(error),
        });
      },
    );
  }, [ownerId, documentId, tabId, shareCode]);

  const close = useCallback(() => {
    asked.current += 1;
    setOpen(false);
    setOpened({ versions: null, state: null, failed: false });
    setDrawing(null);
    onClosed();
  }, [onClosed]);

  const select = useCallback(
    (id: string) => {
      const state = opened.state;
      setSelected(id);
      setStatus(null);
      if (!state) return;
      const ask = ++asked.current;
      if (id === CURRENT_VERSION) {
        setDrawing(currentDrawing(state));
        return;
      }
      const started = performance.now();
      apiReadTextDocumentVersion({ ownerId, documentId, tabId, shareCode }, id)
        .then((read) => {
          if (ask !== asked.current) return;
          setDrawing({
            snapshot: decoded(read.snapshot),
            previous: decoded(read.previous),
            authorship: versionAuthorship(read),
            showChanges: true,
          });
          debugLog('[text-document] version shown', {
            id,
            ms: Math.round(performance.now() - started),
          });
        })
        .catch((error: unknown) => {
          if (ask !== asked.current) return;
          setStatus(VERSION_FAILED);
          debugLog('[text-document] version history failed', {
            reason: 'read',
            id,
            error: String(error),
          });
        });
    },
    [opened.state, ownerId, documentId, tabId, shareCode],
  );

  const actions = useMemo<OfficeActions>(
    () => ({
      [SEE_VERSION_HISTORY]: local
        ? {
            run: () => {},
            disabled: true,
            note: VERSION_HISTORY_LOCAL_NOTE,
            hint: VERSION_HISTORY_LOCAL_HINT,
          }
        : {
            run: () => {
              setOpen(true);
              load();
            },
          },
    }),
    [local, load],
  );

  // Drawn outside the surface, so the editor's shortcut layer never hears the keys pressed in it.
  const mode = open
    ? createPortal(
        <OfficeVersionHistory
          versions={opened.versions}
          failed={opened.failed}
          selected={selected}
          now={now()}
          status={status}
          onSelect={select}
          onRetry={load}
          onClose={close}
        >
          {opened.state && drawing ? (
            <TextDocumentVersionView
              state={opened.state}
              tab={tab}
              drawing={drawing}
              format={format}
              where={{ ownerId, documentId, shareCode }}
            />
          ) : null}
        </OfficeVersionHistory>,
        document.body,
      )
    : null;
  return { actions, mode, open };
}
