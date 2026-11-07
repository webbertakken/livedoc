'use client';

// The screenshot a report carries (docs/specs/016-platform/bug-reports.md "The form"): none until asked, then one
// captured, chosen, pasted or dropped, replacing what was attached; previewed before sending, and removable. A capture
// that is still running can be waited on, so Send never sends an earlier picture or none by mistake. Every change is
// kept in the draft, so the picture is back when the form opens again.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BugReportScreenshot } from '@livedoc/api-schema';
import { saveBugReportDraftScreenshot } from '@/lib/bug-report/draft';
import {
  captureScreen,
  encodeImageFile,
  restoreScreenshot,
  type PreparedScreenshot,
} from '@/lib/bug-report/screenshot';
import { BUG_REPORT_COPY } from './bug-report-copy';

export type BugReportScreenshotState = {
  prepared: PreparedScreenshot | null;
  capturing: boolean;
  error: string | null;
  // Polite announcement of what just happened ("Screenshot added.").
  announcement: string;
  capture: () => void;
  attachFile: (file: Blob) => void;
  remove: () => void;
  // The attached screenshot once any running capture or encoding has ended.
  settled: () => Promise<PreparedScreenshot | null>;
};

// `restored` is the draft's screenshot, attached from the start.
export function useBugReportScreenshot(
  restored: BugReportScreenshot | null = null,
): BugReportScreenshotState {
  const [initial] = useState(() => (restored ? restoreScreenshot(restored) : null));
  const [prepared, setPrepared] = useState<PreparedScreenshot | null>(initial);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const running = useRef<Promise<PreparedScreenshot | null> | null>(null);
  const latest = useRef<PreparedScreenshot | null>(initial);
  const mounted = useRef(true);

  const replace = useCallback((next: PreparedScreenshot | null) => {
    saveBugReportDraftScreenshot(next?.screenshot ?? null);
    // A capture that ends after the form closed is kept in the draft; its preview has no form to show it.
    if (!mounted.current) {
      if (next) URL.revokeObjectURL(next.previewUrl);
      return;
    }
    if (latest.current) URL.revokeObjectURL(latest.current.previewUrl);
    latest.current = next;
    setPrepared(next);
  }, []);

  // The preview's object URL goes with the form. A remount of the same form (Strict Mode) makes it again.
  const revokedUrl = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    const shown = latest.current;
    if (shown && shown.previewUrl === revokedUrl.current) {
      latest.current = restoreScreenshot(shown.screenshot);
      setPrepared(latest.current);
    }
    return () => {
      mounted.current = false;
      if (!latest.current) return;
      URL.revokeObjectURL(latest.current.previewUrl);
      revokedUrl.current = latest.current.previewUrl;
    };
  }, []);

  const run = useCallback(
    (work: () => Promise<PreparedScreenshot | null>, failure: string) => {
      if (running.current) return;
      setCapturing(true);
      setError(null);
      setAnnouncement('');
      const job = work().then((next) => {
        running.current = null;
        setCapturing(false);
        if (next) {
          replace(next);
          setAnnouncement(BUG_REPORT_COPY.screenshotAdded);
        } else {
          setError(failure);
        }
        return next ?? latest.current;
      });
      running.current = job;
    },
    [replace],
  );

  return {
    prepared,
    capturing,
    error,
    announcement,
    capture: useCallback(() => run(captureScreen, BUG_REPORT_COPY.captureFailed), [run]),
    attachFile: useCallback(
      (file: Blob) => run(() => encodeImageFile(file), BUG_REPORT_COPY.imageRefused),
      [run],
    ),
    remove: useCallback(() => {
      replace(null);
      setError(null);
      setAnnouncement('');
    }, [replace]),
    settled: useCallback(async () => (running.current ? running.current : latest.current), []),
  };
}
