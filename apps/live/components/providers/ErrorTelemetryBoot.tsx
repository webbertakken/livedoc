'use client';

import { useEffect } from 'react';
import { installClientErrorTracking } from '@livedoc/telemetry-client';
import { setApiErrorReporter, setApiWarningReporter } from '@/lib/api/error-report';
import { track } from '@/lib/telemetry';
import { installRecentErrorCapture, recordClientError } from '@/lib/bug-report/recent-errors';

// Error telemetry boot (docs/specs/017-telemetry/telemetry.md 'Error' category): mounts once from the
// root layout and wires the two editor-side error sources into track():
//
//   - window-level uncaught exceptions / unhandled rejections, via the
//     shared installClientErrorTracking (`Uncaught.<Page>.<ErrorName>`,
//     capped per type per page load);
//   - the api-client's failure choke points, via setApiErrorReporter
//     (lib/api can't import lib/telemetry itself — import cycle — so the
//     wiring happens here, mirroring setTokenProvider). The api client
//     builds the type (`Http<status>.<Action>`, `Network.<Method>.<Route>`;
//     see lib/api/error-report.ts), capped per type per page load the same way.
//
// Render crashes inside an editor area are reported by AreaErrorBoundary.
// Only generic tokens ever leave: never a message, stack, URL, or user
// content. The reporter deliberately stays registered for the page's
// lifetime (no cleanup): the layout never unmounts, and an unload race that
// dropped the reporter would silently lose tail-of-session errors.
export function ErrorTelemetryBoot() {
  useEffect(() => {
    installClientErrorTracking(track);
    // The newest client errors, for a bug report's context (docs/specs/016-platform/bug-reports.md "Context").
    installRecentErrorCapture(window);
    setApiErrorReporter((type) => {
      track('Error', 'Api', type);
      recordClientError('api', type);
    });
    setApiWarningReporter((type) => track('Error', 'Warning', type));
  }, []);
  return null;
}
