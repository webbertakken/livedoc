// What runs in a mode drawn above the session's level (docs/specs/004-interface-design/office-shell.md "Modes"): an
// item above the session's level runs only when the mode names it as one a proposal can carry; every other one is
// dimmed, from a menu, the toolbar, a context menu or a key, so nothing above the session's level becomes runnable.
import { levelAtLeast, lowerLevel, type AccessLevel } from '@livedoc/api-schema';
import type { OfficeActions, OfficeCatalogue, OfficeEntry } from './office-catalogue';
import type { OfficeProposals } from './office-mode';
import type { OfficeToolbar } from './office-toolbar';
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';

function entryLevels(entries: readonly OfficeEntry[], into: Map<string, AccessLevel>): void {
  for (const entry of entries) {
    if (entry.kind === 'item') {
      const known = into.get(entry.id);
      into.set(entry.id, known ? lowerLevel(known, entry.level) : entry.level);
    } else if (entry.kind === 'submenu') entryLevels(entry.entries, into);
  }
}

/** Each item's and control's least level, across the menus, the toolbar and the context menu that draw it. */
export function officeItemLevels(
  catalogue: OfficeCatalogue,
  toolbar: OfficeToolbar,
  context: readonly OfficeEntry[],
): Map<string, AccessLevel> {
  const levels = new Map<string, AccessLevel>();
  for (const menu of catalogue) entryLevels(menu.entries, levels);
  entryLevels(context, levels);
  for (const control of toolbar.flatMap((group) => group.controls)) {
    const known = levels.get(control.id);
    levels.set(control.id, known ? lowerLevel(known, control.level) : control.level);
  }
  return levels;
}

/**
 * The actions as a mode drawn above the session runs them: one above the session's level and not a proposal's is
 * dimmed. An id nothing draws (a shortcut's own) was never gated by level and is left as it is.
 */
export function proposalActions(
  actions: OfficeActions,
  levels: ReadonlyMap<string, AccessLevel>,
  proposals: OfficeProposals | null,
): OfficeActions {
  if (!proposals) return actions;
  const out: Record<string, OfficeActions[string]> = {};
  for (const [id, action] of Object.entries(actions)) {
    const level = levels.get(id);
    const above = level !== undefined && !levelAtLeast(proposals.below, level);
    out[id] = action && above && !proposals.runs.has(id) ? { ...action, disabled: true } : action;
  }
  return out;
}

/**
 * The toolbar's choice controls as a mode drawn above the session runs them: a control above the session's level that
 * is no proposal has every cell dimmed; any other has its cells narrowed as the actions are.
 */
export function proposalChoices(
  choices: OfficeChoices | null,
  levels: ReadonlyMap<string, AccessLevel>,
  proposals: OfficeProposals | null,
): OfficeChoices | null {
  if (!proposals || !choices) return choices;
  const dimmedAll = (actions: OfficeActions): OfficeActions =>
    Object.fromEntries(
      Object.entries(actions).map(([id, action]) => [
        id,
        action ? { ...action, disabled: true } : action,
      ]),
    );
  return Object.fromEntries(
    Object.entries(choices).map(([id, choice]) => {
      const level = levels.get(id);
      const shut =
        level !== undefined && !levelAtLeast(proposals.below, level) && !proposals.runs.has(id);
      if (shut) {
        // Its own panel (Borders) never opens either.
        const { panel: _panel, ...rest } = choice;
        return [id, { ...rest, actions: dimmedAll(choice.actions) }];
      }
      return [
        id,
        {
          ...choice,
          actions: proposalActions(choice.actions, levels, proposals),
        },
      ];
    }),
  );
}
