'use client';

// A filed card's screenshot (docs/specs/016-platform/bug-reports.md "Screenshots"): fetched with the viewer's identity
// once their session is known, shown when the api serves it (to the Bug Tracker's owner only), else one plain line.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { debugLog } from '@/lib/debug-log';
import { Brand } from '@livedoc/ui';
import { useDeferredAuth } from '@/components/providers/deferred-auth';
import { API_BASE, apiFetch, apiHeaders } from '@/lib/api/core';
import { reportServerError } from '@/lib/api/error-report';
import { getGuestSelfId } from '@/lib/local-identity';

const KEY = /^(?:anonymous|[0-9a-f]{32})\/[0-9a-f-]{36}\.(?:webp|jpg|png)$/;

const subscribeNever = () => () => {};
const readKey = () => new URLSearchParams(window.location.search).get('key') ?? '';
// The prerendered page knows no key yet.
const serverKey = () => null;

type Fetched = { kind: 'shown'; url: string } | { kind: 'missing' };

export function BugScreenshotPage() {
  const { authLoaded } = useDeferredAuth();
  const key = useSyncExternalStore(subscribeNever, readKey, serverKey);
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const valid = key !== null && KEY.test(key);

  useEffect(() => {
    if (!authLoaded || !valid) return;
    let url: string | null = null;
    let live = true;
    void (async () => {
      try {
        const headers = (await apiHeaders(getGuestSelfId() ?? '')) as Record<string, string>;
        const res = await apiFetch(`${API_BASE}/bug-reports/screenshots/${key}`, { headers });
        await reportServerError(res, 'read bug screenshot');
        if (!res.ok) throw new Error(`status ${res.status}`);
        url = URL.createObjectURL(await res.blob());
        if (live) setFetched({ kind: 'shown', url });
      } catch (error) {
        debugLog('[bug-reports] screenshot.unavailable', { error: String(error) });
        if (live) setFetched({ kind: 'missing' });
      }
    })();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [authLoaded, valid, key]);

  const missing = (key !== null && !valid) || fetched?.kind === 'missing';
  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-6">
      <Brand href="/" size="md" />
      {fetched?.kind === 'shown' ? (
        <img
          src={fetched.url}
          alt="Bug report screenshot"
          className="max-h-[85vh] max-w-full rounded-control border border-slate-200 object-contain dark:border-slate-700"
        />
      ) : (
        <p role="status" className="text-body text-slate-600 dark:text-slate-300">
          {missing
            ? 'This screenshot has expired, or only the Bug Tracker’s owner can see it.'
            : 'Loading the screenshot…'}
        </p>
      )}
    </main>
  );
}
