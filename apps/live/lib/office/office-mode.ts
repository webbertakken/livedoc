// A person's mode on an office kind (docs/specs/004-interface-design/office-shell.md "Modes"): the set is the kind's
// own, each mode reached from a least share level and drawn at no more than the session's; one person's, never shared.
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
  // The level the menus and toolbar are drawn for in it, never more than the session's.
  drawnAt: AccessLevel;
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

/** The level the menus and toolbar are drawn for in a mode: the lower of the session's and the mode's own. */
export function levelInMode<M extends string>(
  modes: readonly OfficeModeInfo<M>[],
  level: AccessLevel,
  mode: M,
): AccessLevel {
  return lowerLevel(level, modes.find((m) => m.mode === mode)?.drawnAt ?? 'view');
}
