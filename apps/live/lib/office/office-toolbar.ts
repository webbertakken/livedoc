// An office kind's toolbar as data (docs/specs/004-interface-design/office-shell.md "Toolbar"): groups of controls the
// shell draws, binds by id (a control that runs a menu item shares its id), and hides as the session's level says.
import type { IconPrim } from '@livedoc/icons';
import { levelAtLeast, type AccessLevel } from '@livedoc/api-schema';
import type { OfficeActions, OfficeItemStatus } from './office-catalogue';

export type OfficeControlLook =
  // A glyph alone; `toggle` draws its pressed state from the binding's `checked`; `split` adds a chevron of its own
  // opening the kind's choice grid of its id (a list button).
  | { kind: 'icon'; icon: readonly IconPrim[]; toggle?: boolean; menu?: boolean; split?: boolean }
  // A value shown as text (Styles, Font with a chevron for their list; the font size without), `width` px wide.
  | { kind: 'text'; text: string; width: number; list?: boolean }
  // A value field, bound by the shell's field of that name (the zoom, the font size), not by an action.
  | { kind: 'zoom' }
  | { kind: 'fontSize' }
  | { kind: 'font' }
  // A colour, bound by the shell's colour of its id: its glyph over a bar in the colour, opening the colour picker.
  | { kind: 'colour'; icon: readonly IconPrim[] }
  // A choice, bound by the shell's choice of its id: the value at the caret, `width` px wide, opening its menu.
  | { kind: 'choice'; width: number };

/** The toolbar's value fields (office-shell.md "Toolbar"). */
export type OfficeFieldKind = 'zoom' | 'fontSize' | 'font' | 'colour' | 'choice';

export type OfficeControl = {
  id: string;
  label: string;
  level: AccessLevel;
  status: OfficeItemStatus;
  // Its row in the kind's shortcut registry.
  shortcut?: string;
  look: OfficeControlLook;
};

export type OfficeToolbarGroup = { id: string; label: string; controls: readonly OfficeControl[] };
export type OfficeToolbar = readonly OfficeToolbarGroup[];

/**
 * What the session sees: controls at or below its level that are coming soon or bound (a value field, when the shell has it;
 * an icon with a menu, when the kind binds it as a choice, by `choiceIds`), and the groups left with any.
 */
export function visibleToolbar(
  toolbar: OfficeToolbar,
  level: AccessLevel,
  actions: OfficeActions,
  fields: Readonly<Record<OfficeFieldKind, boolean>>,
  choiceIds: readonly string[] = [],
): OfficeToolbarGroup[] {
  const shown = (control: OfficeControl) =>
    levelAtLeast(level, control.level) &&
    (control.status === 'comingSoon' ||
      (control.look.kind === 'zoom' ||
      control.look.kind === 'fontSize' ||
      control.look.kind === 'font' ||
      control.look.kind === 'colour' ||
      control.look.kind === 'choice'
        ? fields[control.look.kind]
        : actions[control.id] !== undefined ||
          (control.look.kind === 'icon' &&
            control.look.menu === true &&
            choiceIds.includes(control.id))));
  return toolbar.flatMap((group) => {
    const controls = group.controls.filter(shown);
    if (controls.length === 0) return [];
    return [controls.length === group.controls.length ? group : { ...group, controls }];
  });
}

/**
 * How many controls fit, in order, in `room` px, given each control's width and whether it starts a group (a divider
 * of `dividerPx` before it). All of them, or as many as fit beside the More button of `morePx`.
 */
export function controlsThatFit(
  widths: readonly { width: number; startsGroup: boolean }[],
  room: number,
  dividerPx: number,
  morePx: number,
): number {
  const spans = widths.map((w, i) => w.width + (w.startsGroup && i > 0 ? dividerPx : 0));
  const total = spans.reduce((a, b) => a + b, 0);
  if (total <= room) return widths.length;
  let used = 0;
  for (let i = 0; i < spans.length; i += 1) {
    used += spans[i]!;
    if (used > room - morePx) return i;
  }
  return widths.length;
}
