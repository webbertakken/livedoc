'use client';

// One person's editing mode on an office surface (docs/specs/034-text-documents/review.md "Editing modes"): it starts
// at the most their level allows of what is built, is kept while the surface is open, and is chosen from the title
// row's switch, View > Mode or the shortcuts, whose items it binds.
import { useMemo, useState } from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import type { OfficeModeChoice } from '@/components/office/OfficeModeSwitch';
import type { OfficeAction } from '@/lib/office/office-catalogue';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { modesFor, startingMode, type OfficeMode } from './office-mode';

export function useOfficeMode(
  level: AccessLevel,
  // The kind's telemetry type for a change: `UI · Changed · <type>`.
  telemetryType: 'TextDocumentMode',
): {
  mode: OfficeMode;
  choice: OfficeModeChoice;
  actions: Record<string, OfficeAction>;
} {
  const [chosen, setChosen] = useState<OfficeMode | null>(null);
  const modes = useMemo(() => modesFor(level), [level]);
  // A level that changes under the person (a role taken away) leaves a mode it no longer allows.
  const mode = chosen && modes.some((m) => m.mode === chosen) ? chosen : startingMode(level);

  return useMemo(() => {
    const change = (next: OfficeMode) => {
      setChosen(next);
      debugLog('[office] mode', { mode: next });
      track('UI', 'Changed', telemetryType);
    };
    const actions: Record<string, OfficeAction> = {};
    for (const m of modes)
      if (m.status === 'built')
        actions[m.item] = { run: () => change(m.mode), checked: m.mode === mode };
    return { mode, choice: { mode, modes, onChange: change }, actions };
  }, [mode, modes, telemetryType]);
}
