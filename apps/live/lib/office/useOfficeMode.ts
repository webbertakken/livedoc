'use client';

// One person's mode on an office surface (docs/specs/004-interface-design/office-shell.md "Modes"), from the kind's own
// set: it starts at the first built mode their level reaches, is kept while the surface is open, and is chosen from the
// title row's switch, the kind's menu items or their shortcuts, whose items it binds.
import { useMemo, useState } from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import type { OfficeModeChoice } from '@/components/office/OfficeModeSwitch';
import type { OfficeAction } from '@/lib/office/office-catalogue';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { modesFor, startingMode, type OfficeModeInfo } from './office-mode';

export function useOfficeMode<M extends string>(
  level: AccessLevel,
  // The kind's modes, in order: a stable array (a module constant).
  kindModes: readonly OfficeModeInfo<M>[],
  // The kind's telemetry type for a change: `UI · Changed · <type>`.
  telemetryType: string,
): {
  mode: M;
  choice: OfficeModeChoice;
  actions: Record<string, OfficeAction>;
} {
  const [chosen, setChosen] = useState<M | null>(null);
  const modes = useMemo(() => modesFor(kindModes, level), [kindModes, level]);
  // A level that changes under the person (a role taken away) leaves a mode it no longer allows.
  const mode =
    chosen && modes.some((m) => m.mode === chosen) ? chosen : startingMode(kindModes, level);

  return useMemo(() => {
    const change = (next: M) => {
      setChosen(next);
      debugLog('[office] mode', { mode: next });
      track('UI', 'Changed', telemetryType);
    };
    const actions: Record<string, OfficeAction> = {};
    for (const m of modes)
      if (m.status === 'built')
        actions[m.item] = { run: () => change(m.mode), checked: m.mode === mode };
    const choice: OfficeModeChoice = {
      mode,
      modes,
      onChange: (next) => {
        const found = modes.find((m) => m.mode === next);
        if (found) change(found.mode);
      },
    };
    return { mode, choice, actions };
  }, [mode, modes, telemetryType]);
}
