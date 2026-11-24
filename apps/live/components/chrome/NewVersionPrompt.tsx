'use client';

// "A new version of LiveDoc is ready." (docs/specs/016-platform/new-version-prompt.md): shown when
// the server serves a newer document format than this editor was built for, or a newer build upgraded
// this browser's offline store. Calm and non-blocking:
// a polite status that never takes focus, never reloads by itself, and reloads only once everything
// edited has been saved.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DOCUMENT_FORMAT } from '@livedoc/api-schema';
import { Button } from '@livedoc/ui';
import {
  newVersionAvailable,
  newVersionReason,
  serverDocumentFormat,
  subscribeServerRelease,
} from '@/lib/server-release';
import { reloadWhenSaved } from '@/lib/reload-when-saved';
import { track } from '@/lib/telemetry';
import { debugLog } from '@/lib/debug-log';
import { TOAST_SURFACE } from '@/components/toast/ToastCard';
import { announceToastFloorChange } from '@/components/toast/toast-floor';

type Phase = 'offered' | 'saving' | 'unsaved';

const COPY: Record<Phase, string> = {
  offered: 'A new version of LiveDoc is ready.',
  saving: 'Saving your changes…',
  unsaved: "Your latest changes aren't saved yet. Reload once they are.",
};

const getReason = () => newVersionReason();

export function NewVersionPrompt({
  hasUnsavedChanges,
  reload = () => window.location.reload(),
}: {
  hasUnsavedChanges: () => boolean;
  reload?: () => void;
}) {
  const reason = useSyncExternalStore(subscribeServerRelease, getReason, () => 0);
  const [phase, setPhase] = useState<Phase>('offered');
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const announced = useRef(false);
  const visible =
    reason > 0 && newVersionAvailable() && (dismissedAt === null || reason > dismissedAt);

  useEffect(() => {
    if (!visible || announced.current) return;
    announced.current = true;
    debugLog('[document-format] new version available', {
      editor: DOCUMENT_FORMAT,
      server: serverDocumentFormat(),
    });
    track('UI', 'Opened', 'NewVersionPrompt');
  }, [visible]);
  // A toast already up stands on the prompt while it shows, and drops back when it goes.
  useEffect(() => {
    announceToastFloorChange();
  }, [visible]);

  if (!visible) return null;

  const onReload = async () => {
    track('UI', 'Used', 'NewVersionPrompt');
    setPhase('saving');
    const outcome = await reloadWhenSaved({ hasUnsavedChanges, reload });
    if (outcome === 'unsaved') setPhase('unsaved');
  };

  return (
    <div
      role="status"
      data-new-version-prompt=""
      // The toast's look, not its stack (docs/specs/004-interface-design/toasts.md "Out of scope"); the toasts
      // stand on it, as on any bottom chrome.
      data-toast-floor=""
      className={`fixed bottom-20 left-1/2 z-[var(--z-chrome)] flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 animate-toast-in items-center gap-3 border-slate-200 px-4 py-3 text-body dark:border-slate-700 ${TOAST_SURFACE}`}
    >
      <p className="min-w-0 flex-1">{COPY[phase]}</p>
      <Button size="sm" disabled={phase === 'saving'} onClick={() => void onReload()}>
        Reload
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={phase === 'saving'}
        onClick={() => {
          setDismissedAt(reason);
          setPhase('offered');
        }}
      >
        Not now
      </Button>
    </div>
  );
}
