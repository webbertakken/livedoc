'use client';

// An office toolbar's split toggle (docs/specs/004-interface-design/office-shell.md "Toolbar"): a toggle (a list
// button), and beside it a chevron of its own, "<name> styles", opening the kind's choice grid under it; or, for a kind
// whose choices are commands, "<name> options" opening them as a menu. Down on the toggle opens the grid or menu too.
// Both halves are stops of the bar's arrows; the toggle holds the bar's tab stop.
import { useState } from 'react';
import { ChevronDownIcon, Glyph, HoverCard, Prims } from '@livedoc/ui';
import type { IconPrim } from '@livedoc/icons';
import { noShortcuts, type OfficeAction } from '@/lib/office/office-catalogue';
import type { ShortcutText } from '@/lib/office/shortcut-notation';
import type { OfficeChoice } from './OfficeChoiceMenu';
import { OfficeChoiceGrid } from './OfficeChoiceGrid';
import { OfficeMenuPanel } from './OfficeMenuPanel';
import { OfficePopup } from './OfficePopup';

/** The chevron's id, beside its toggle's, by which the bar finds it. */
export const splitChevronId = (id: string) => `${id}-styles`;

export function OfficeSplitToggle({
  id,
  label,
  icon,
  action,
  pressed,
  inert,
  description,
  shortcut,
  choice,
  tabIndex,
  className,
  chevronClassName,
}: {
  id: string;
  label: string;
  icon: readonly IconPrim[];
  action: OfficeAction | undefined;
  pressed: boolean;
  // Coming soon, or unable to run now: neither half acts.
  inert: boolean;
  description?: string;
  shortcut: ShortcutText | null;
  // The grid the chevron opens; with none, the chevron is not drawn.
  choice: OfficeChoice | undefined;
  tabIndex: number;
  className: string;
  // The chevron's look: the control's, narrower.
  chevronClassName: string;
}) {
  const [chevron, setChevron] = useState<HTMLButtonElement | null>(null);
  // The cell in force as the grid opened; undefined while it is closed.
  const [open, setOpen] = useState<string | null | undefined>(undefined);
  const grid = choice?.grid;
  // Commands in place of looks: the chevron opens them as a menu.
  const menu = !grid && !!choice?.entries.length;
  const openGrid = () => {
    if (!inert && choice) setOpen(choice.read());
  };
  const name = menu ? `${label} options` : `${label} styles`;
  return (
    <span className="flex items-center">
      <HoverCard title={label} description={description}>
        <button
          type="button"
          aria-label={label}
          aria-disabled={inert || undefined}
          aria-pressed={pressed}
          aria-keyshortcuts={inert ? undefined : shortcut?.aria}
          data-office-control={id}
          tabIndex={tabIndex}
          onClick={() => {
            if (!inert) action?.run();
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' || (!grid && !menu)) return;
            e.preventDefault();
            openGrid();
          }}
          className={`${className} min-w-7`}
        >
          <Glyph size={18} units={24}>
            <Prims prims={icon} />
          </Glyph>
        </button>
      </HoverCard>
      {grid || menu ? (
        <HoverCard title={name}>
          <button
            ref={setChevron}
            type="button"
            aria-label={name}
            aria-haspopup="menu"
            aria-expanded={open !== undefined}
            aria-disabled={inert || undefined}
            data-office-control={splitChevronId(id)}
            tabIndex={-1}
            onClick={() => (open !== undefined ? setOpen(undefined) : openGrid())}
            className={`${chevronClassName} w-6`}
          >
            <ChevronDownIcon size={12} />
          </button>
        </HoverCard>
      ) : null}
      {grid && choice && open !== undefined ? (
        <OfficePopup anchor={chevron}>
          <OfficeChoiceGrid
            label={name}
            grid={grid}
            actions={choice.actions}
            value={open}
            trigger={chevron}
            onClose={() => setOpen(undefined)}
          />
        </OfficePopup>
      ) : null}
      {menu && choice && open !== undefined ? (
        <OfficePopup anchor={chevron}>
          <OfficeMenuPanel
            entries={choice.entries}
            actions={choice.actions}
            shortcutOf={noShortcuts}
            trigger={chevron}
            initialFocus="first"
            placement="popup"
            label={name}
            onClose={() => setOpen(undefined)}
            onDone={() => setOpen(undefined)}
          />
        </OfficePopup>
      ) : null}
    </span>
  );
}
