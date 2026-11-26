// A person's mode on an office kind (docs/specs/004-interface-design/office-shell.md "Modes"): the set is the kind's
// own, each mode reached from a least share level and drawn at no more than the session's, unless its changes are
// proposals the room judges; one person's, never shared.
import { levelAtLeast, lowerLevel, type AccessLevel } from '@livedoc/api-schema';
import type { IconPrim } from '@livedoc/icons';
import type { OfficeItemStatus } from './office-catalogue';

export type OfficeModeInfo<M extends string = string> = {
  mode: M;
  label: string;
  // What it does, under its label in the switch.
  description: string;
  // Its glyph (24 units).
  icon: readonly IconPrim[];
  // The least level that reaches it.
  level: AccessLevel;
  // The level the menus and toolbar are drawn for in it, never more than the session's unless it proposes.
  drawnAt: AccessLevel;
  // Its changes are proposals the room judges (Suggesting): drawn at `drawnAt` even above the session's level, where
  // only these items run above it.
  proposes?: readonly string[];
  status: OfficeItemStatus;
  // Its menu item, whose catalogue row holds its shortcut.
  item: string;
};

/** The kind's modes a level reaches, in the kind's order. */
export const modesFor = <M extends string>(
  modes: readonly OfficeModeInfo<M>[],
  level: AccessLevel,
): OfficeModeInfo<M>[] => modes.filter((m) => levelAtLeast(level, m.level));

/** Where a person starts: the first built mode their level reaches, else the kind's last mode. */
export function startingMode<M extends string>(
  modes: readonly OfficeModeInfo<M>[],
  level: AccessLevel,
): M {
  return (modesFor(modes, level).find((m) => m.status === 'built') ?? modes[modes.length - 1]!)
    .mode;
}

// A mode drawn above the session: what runs above its level there.
export type OfficeProposals = {
  // The session's own level.
  below: AccessLevel;
  // The items a proposal can carry, which run above it.
  runs: ReadonlySet<string>;
};

const proposingFor = <M extends string>(
  modes: readonly OfficeModeInfo<M>[],
  level: AccessLevel,
  mode: M,
): OfficeModeInfo<M> | null => {
  const found = modes.find((m) => m.mode === mode);
  return found?.proposes && levelAtLeast(level, found.level) && !levelAtLeast(level, found.drawnAt)
    ? found
    : null;
};

/**
 * The level the menus and toolbar are drawn for in a mode: the lower of the session's and the mode's own, or the
 * mode's own when its changes are proposals and the session reaches it.
 */
export function levelInMode<M extends string>(
  modes: readonly OfficeModeInfo<M>[],
  level: AccessLevel,
  mode: M,
): AccessLevel {
  const proposing = proposingFor(modes, level, mode);
  if (proposing) return proposing.drawnAt;
  return lowerLevel(level, modes.find((m) => m.mode === mode)?.drawnAt ?? 'view');
}

/** What runs above the session's level in a mode drawn above it; null when it is not. */
export function proposalsInMode<M extends string>(
  modes: readonly OfficeModeInfo<M>[],
  level: AccessLevel,
  mode: M,
): OfficeProposals | null {
  const proposing = proposingFor(modes, level, mode);
  return proposing ? { below: level, runs: new Set(proposing.proposes) } : null;
}
