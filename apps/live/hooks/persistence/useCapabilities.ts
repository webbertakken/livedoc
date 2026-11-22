'use client';

import { useEffect, useState } from 'react';
import { apiGetCapabilities } from '@/lib/api-client';

// Fetches GET /api/capabilities once at mount and returns which
// optional server features are available. Fails closed on any network
// error — a missing or mis-configured api worker means no features.
// The result is stable for the lifetime of the page; no polling needed
// because capabilities are determined by deployment config, not runtime
// state.
export function useCapabilities(enabled = true): {
  aiEnabled: boolean;
  emailEnabled: boolean;
  // The host stores files (docs/specs/006-document/blob-store.md "Without object storage"); false until it says so.
  filesEnabled: boolean;
} {
  const [aiEnabled, setAiEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [filesEnabled, setFilesEnabled] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    void apiGetCapabilities().then((caps) => {
      setAiEnabled(caps.aiEnabled);
      setEmailEnabled(caps.emailEnabled ?? false);
      setFilesEnabled(caps.filesEnabled ?? false);
    });
  }, [enabled]);

  return { aiEnabled, emailEnabled, filesEnabled };
}
