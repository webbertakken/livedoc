'use client';

// An office toolbar's choice control (docs/specs/004-interface-design/office-shell.md "Toolbar", choice controls): the
// value at the caret as text with a chevron, blank over a mixed selection, opening a menu of the kind's choices over
// the page, the one at the caret checked. The Styles control is one; the font control draws its own value and menu on
// it. A choice runs the kind's action, which gives focus back to the writing.
import { useState, type ReactNode } from 'react';
import { ChevronDownIcon, Glyph, HoverCard, Prims } from '@livedoc/ui';
import type { IconPrim } from '@livedoc/icons';
import { noShortcuts, type OfficeActions, type OfficeEntry } from '@/lib/office/office-catalogue';
import { OfficeMenuPanel } from './OfficeMenuPanel';
import { OfficePopup } from './OfficePopup';
import type { OfficeGrid } from './OfficeChoiceGrid';

/** What the kind hands a choice control: the value now (read as the caret changes), its choices and their actions. */
export type OfficeChoice = {
  read: () => string | null;
  entries: readonly OfficeEntry[];
  actions: OfficeActions;
  // An icon control's glyph for the value there is (the Align control shows the alignment's icon).
  iconOf?: (value: string | null) => readonly IconPrim[];
  // A split toggle's grid of choices in place of a menu: its cells run `actions` by id, `read` names the one in force.
  grid?: OfficeGrid;
  // An icon control's own panel in place of its menu (the Borders panel), told how to close.
  panel?: (close: () => void) => ReactNode;
};

/** The kind's choice controls, by control id. */
export type OfficeChoices = Readonly<Record<string, OfficeChoice>>;

export function OfficeChoiceMenu({
  id,
  label,
  value,
  italic = false,
  icon,
  description,
  entries,
  actions,
  width,
  tabIndex,
  className,
  onOpen,
  panel,
}: {
  // The control's id, which the toolbar finds it by.
  id: string;
  label: string;
  // The value at the caret; null over a mixed selection.
  value: string | null;
  // The value in italics (a font drawn as another).
  italic?: boolean;
  // Drawn as this glyph and a chevron instead of the value's text (an icon control with a menu).
  icon?: readonly IconPrim[];
  // The control's tooltip line under its name.
  description?: string;
  entries: readonly OfficeEntry[];
  actions: OfficeActions;
  width: number;
  tabIndex: number;
  className: string;
  // Read what the menu shows afresh as it opens.
  onOpen?: () => void;
  // A panel of the kind's own in place of the menu (OfficeChoice.panel).
  panel?: (close: () => void) => ReactNode;
}) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const openMenu = () => {
    onOpen?.();
    setOpen(true);
  };
  return (
    <>
      <HoverCard title={label} description={description}>
        <button
          ref={setTrigger}
          type="button"
          aria-label={value ? `${label}: ${value}` : label}
          aria-haspopup={panel ? 'dialog' : 'menu'}
          aria-expanded={open}
          data-office-control={id}
          tabIndex={tabIndex}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' || open) return;
            e.preventDefault();
            openMenu();
          }}
          style={icon ? undefined : { width }}
          className={className}
        >
          {icon ? (
            <Glyph size={18} units={24}>
              <Prims prims={icon} />
            </Glyph>
          ) : (
            <span className={`truncate pl-1 ${italic ? 'italic' : ''}`}>{value ?? ''}</span>
          )}
          <ChevronDownIcon size={12} />
        </button>
      </HoverCard>
      {open && panel ? (
        <OfficePopup anchor={trigger}>
          {panel(() => {
            // Escape or a press outside from inside the panel hands focus back to the control.
            const inside = document.activeElement?.closest('[data-office-popup]');
            setOpen(false);
            if (inside) trigger?.focus({ preventScroll: true });
          })}
        </OfficePopup>
      ) : open ? (
        <OfficePopup anchor={trigger}>
          <OfficeMenuPanel
            entries={entries}
            actions={actions}
            shortcutOf={noShortcuts}
            trigger={trigger}
            initialFocus="first"
            placement="popup"
            label={label}
            onClose={() => setOpen(false)}
            onDone={() => setOpen(false)}
          />
        </OfficePopup>
      ) : null}
    </>
  );
}
