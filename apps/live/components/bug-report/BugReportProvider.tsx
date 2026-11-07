'use client';

// The one Report a Bug form (docs/specs/016-platform/bug-reports.md "Entries"): mounted once in the root layout, opened
// from anywhere through useOpenBugReport(). The form itself loads on the first opening, so no page pays for it up
// front. Focus returns to the control that opened it.
import dynamic from 'next/dynamic';
import { debugLog } from '@/lib/debug-log';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { REPORT_A_BUG_PATH } from '@livedoc/ui';
import { track } from '@/lib/telemetry';

const BugReportDialog = dynamic(() => import('./BugReportDialog').then((m) => m.BugReportDialog), {
  ssr: false,
});

export type OpenBugReportOptions = {
  // The control to give focus back to on close; the active element when left out.
  trigger?: HTMLElement | null;
  // Runs once the form closes (the standalone page goes back).
  onClosed?: () => void;
};

type OpenBugReport = (options?: OpenBugReportOptions) => void;

const OpenBugReportContext = createContext<OpenBugReport | null>(null);

export function BugReportProvider({ children }: { children: ReactNode }) {
  // A new key per opening: the form starts afresh from the draft (lib/bug-report/draft.ts) every time.
  const [opening, setOpening] = useState<number | null>(null);
  const pending = useRef<OpenBugReportOptions>({});

  const open = useCallback<OpenBugReport>((options = {}) => {
    const trigger =
      options.trigger ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    pending.current = { ...options, trigger };
    debugLog('[bug-reports] opened');
    track('Feedback', 'Opened', 'Bug');
    setOpening(Date.now());
  }, []);

  const close = useCallback(() => {
    const { trigger, onClosed } = pending.current;
    pending.current = {};
    setOpening(null);
    // After the dialog has gone, so its focus trap does not take focus back.
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus();
      onClosed?.();
    });
  }, []);

  const value = useMemo(() => open, [open]);
  return (
    <OpenBugReportContext.Provider value={value}>
      {children}
      {opening !== null ? <BugReportDialog key={opening} onClose={close} /> : null}
    </OpenBugReportContext.Provider>
  );
}

export function useOpenBugReport(): OpenBugReport {
  const open = useContext(OpenBugReportContext);
  return (
    open ??
    (() => {
      console.warn('[bug-reports] opened.outside-provider');
      // Never in the app (the provider is at the root), but a surface outside it still reaches the form.
      window.location.assign(REPORT_A_BUG_PATH);
    })
  );
}
