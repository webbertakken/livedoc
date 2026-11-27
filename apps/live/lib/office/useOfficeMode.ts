'use client';

// One person's mode on an office surface (docs/specs/004-interface-design/office-shell.md "Modes"), from the kind's own
// set: it starts at the first built mode their level reaches, is kept while the document is open (in its page's memory,
// office-mode-memory.ts, where a key is given), and is chosen from the
// title row's switch, the kind's menu items or their shortcuts, whose items it binds.
import { useContext, useMemo, useState } from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import type { OfficeModeChoice } from '@/components/office/OfficeModeSwitch';
import type { OfficeAction } from '@/lib/office/office-catalogue';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { modesFor, startingMode, type OfficeModeInfo } from './office-mode';
import { OfficeModeMemoryContext } from './office-mode-memory';

export function useOfficeMode<M extends string>(
  level: AccessLevel,
  // The kind's modes, in order: a stable array (a module constant).
  kindModes: readonly OfficeModeInfo<M>[],
  // The kind's telemetry type for a change: `UI · Changed · <type>`.
  telemetryType: string,
  // The surface's key in the open document's mode memory (its tab): a surface drawn again keeps the mode chosen.
  memoryKey?: string,
): {
  mode: M;
  choice: OfficeModeChoice;
  actions: Record<string, OfficeAction>;
} {
  const memory = useContext(OfficeModeMemoryContext);
  const [chosen, setChosen] = useState<M | null>(() =>
    memoryKey && memory ? ((memory.get(memoryKey) as M | undefined) ?? null) : null,
  );
  const modes = useMemo(() => modesFor(kindModes, level), [kindModes, level]);
  // A level that changes under the person (a role taken away) leaves a mode it no longer allows.
  const mode =
    chosen && modes.some((m) => m.mode === chosen) ? chosen : startingMode(kindModes, level);

  return useMemo(() => {
    const change = (next: M) => {
      setChosen(next);
      if (memoryKey) memory?.set(memoryKey, next);
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
  }, [mode, modes, telemetryType, memory, memoryKey]);
}
