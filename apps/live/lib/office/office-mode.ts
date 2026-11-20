// A person's editing mode in an office kind (docs/specs/034-text-documents/review.md "Editing modes"): Editing,
// Suggesting or Viewing, one person's, never shared, never more than their share level allows.
import { levelAtLeast, type AccessLevel } from '@livedoc/api-schema';
import type { OfficeItemStatus } from './office-catalogue';

export type OfficeMode = 'editing' | 'suggesting' | 'viewing';

export type OfficeModeInfo = {
  mode: OfficeMode;
  label: string;
  description: string;
  // The least level the mode is for.
  level: AccessLevel;
  status: OfficeItemStatus;
  // Its menu item (View > Mode) and shortcut row.
  item: string;
};

export const OFFICE_MODES: readonly OfficeModeInfo[] = [
  {
    mode: 'editing',
    label: 'Editing',
    description: 'Edit document directly',
    level: 'edit',
    status: 'built',
    item: 'mode-editing',
  },
  {
    mode: 'suggesting',
    label: 'Suggesting',
    description: 'Edits become suggestions',
    level: 'participate',
    status: 'comingSoon',
    item: 'mode-suggesting',
  },
  {
    mode: 'viewing',
    label: 'Viewing',
    description: 'Read or print final document',
    level: 'view',
    status: 'built',
    item: 'mode-viewing',
  },
];

/** The modes a level may use, in order. */
export const modesFor = (level: AccessLevel): OfficeModeInfo[] =>
  OFFICE_MODES.filter((m) => levelAtLeast(level, m.level));

/** Where a person starts: the most their level allows of what is built. */
export function startingMode(level: AccessLevel): OfficeMode {
  return modesFor(level).find((m) => m.status === 'built')?.mode ?? 'viewing';
}

/** The level the menus and toolbar are drawn for in a mode: never more than the session's. */
export function levelInMode(level: AccessLevel, mode: OfficeMode): AccessLevel {
  if (mode === 'viewing') return 'view';
  if (mode === 'suggesting') return levelAtLeast(level, 'participate') ? 'participate' : level;
  return level;
}
