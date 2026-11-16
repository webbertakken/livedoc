'use client';

import { useEffect, useLayoutEffect } from 'react';
import { useAccountApiBootstrap } from '@/hooks/persistence/useAccountApiBootstrap';
import { openEarlyReads } from '@/lib/api/early-reads';
import { isEditorPath } from '@/lib/legacy-editor-path';
import { useDeferredAuth } from './deferred-auth';

// The open path asked while the editor's code downloads (docs/specs/016-platform/web-performance.md "The open path
// asks in parallel"). Every route carries this, so it only decides: at a document's address it opens the early
// reads pool and fetches the code that asks (lib/open-path/early-document-reads.ts) as the page starts, then asks
// once the session has settled the way the editor waits for it. Renders nothing; does nothing anywhere else.

type EarlyReads = typeof import('@/lib/open-path/early-document-reads');

// This page load's early reads: their code on its way, and whether they were asked. Once per page load: a client
// navigation into a document later finds the editor's code already in, with nothing to win.
let pageStart: { code: Promise<EarlyReads>; asked: boolean } | null | undefined;

export function EarlyDocumentReadsBoot() {
  // A session read that answered: the editor's five-second guest fallback is not one, and is never asked as.
  const { authLoaded: sessionRead } = useDeferredAuth();
  // What the editor waits for: the session, and any guest migration it starts.
  const { authLoaded, accountId } = useAccountApiBootstrap();

  // A layout effect, before the editor's own (it sits deeper), so the pool notes every read the page asks.
  useLayoutEffect(() => {
    if (pageStart !== undefined) return;
    pageStart = null;
    if (!isEditorPath(window.location.pathname)) return;
    openEarlyReads();
    const code = import('@/lib/open-path/early-document-reads');
    // Handled where it is awaited; a chunk that cannot load leaves the editor to ask, as it always could.
    code.catch(() => {});
    pageStart = { code, asked: false };
  }, []);

  useEffect(() => {
    const start = pageStart;
    if (!start || start.asked || !sessionRead || !authLoaded) return;
    start.asked = true;
    if (!isEditorPath(window.location.pathname)) return;
    const href = window.location.href;
    void start.code
      .then(({ askEarlyDocumentReads }) =>
        askEarlyDocumentReads({ accountId: accountId ?? null, href }),
      )
      .catch((err: unknown) => console.warn('[early-reads] code_unavailable', err));
  }, [sessionRead, authLoaded, accountId]);

  return null;
}

export function resetEarlyDocumentReadsBootForTests(): void {
  pageStart = undefined;
}
