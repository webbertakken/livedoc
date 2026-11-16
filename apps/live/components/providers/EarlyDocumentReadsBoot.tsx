'use client';

import { useLayoutEffect } from 'react';
import { registerTokenProvider } from '@/lib/api/core';
import { openEarlyReads } from '@/lib/api/early-reads';
import { whenFirstSessionSettled } from '@/lib/first-session';
import { guestMigrationPending } from '@/lib/guest-migration';
import { debugLog } from '@/lib/debug-log';
import { isEditorPath } from '@/lib/legacy-editor-path';

// The open path asked while the editor's code downloads (docs/specs/016-platform/web-performance.md "The open path
// asks in parallel"). Every route carries this, so it only decides: at a document's address it opens the early
// reads pool and fetches the code that asks (lib/open-path/early-document-reads.ts) as the page starts, then asks
// once the session has settled. It hears the session outside React (lib/first-session.ts): a state update at the
// root waits for the editor to hydrate, which is the wait this exists to avoid. Renders nothing.

let started = false;

// Once per page load: a client navigation into a document later finds the editor's code already in.
function startEarlyDocumentReads(): void {
  if (started) return;
  started = true;
  if (!isEditorPath(window.location.pathname)) return;
  openEarlyReads();
  const code = import('@/lib/open-path/early-document-reads');
  // Handled where it is awaited; a chunk that cannot load leaves the editor to ask, as it always could.
  code.catch(() => {});
  void whenFirstSessionSettled()
    .then(async ({ accountId, getToken }) => {
      if (!isEditorPath(window.location.pathname)) return;
      // The editor waits for a guest migration, made with the session token it registers: it asks for itself.
      if (accountId && guestMigrationPending(accountId)) {
        debugLog('[early-reads] none reason=guest-migration');
        return;
      }
      const { askEarlyDocumentReads } = await code;
      // The session token the editor's requests will carry, lent while the early reads ask.
      const unregister = accountId ? registerTokenProvider(getToken) : null;
      try {
        await askEarlyDocumentReads({ accountId, href: window.location.href });
      } finally {
        unregister?.();
      }
    })
    .catch((err: unknown) => console.warn('[early-reads] failed', err));
}

export function EarlyDocumentReadsBoot() {
  // A layout effect, before the editor's own (it sits deeper), so the pool notes every read the page asks.
  useLayoutEffect(startEarlyDocumentReads, []);
  return null;
}

export function resetEarlyDocumentReadsBootForTests(): void {
  started = false;
}
