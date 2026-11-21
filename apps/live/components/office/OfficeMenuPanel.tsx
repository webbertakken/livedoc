'use client';

// One open menu of the office shell (docs/specs/004-interface-design/office-shell.md "Menu bar"): a command menu on
// the shared keyboard model (useMenu), drawn from the kind's catalogue. A row shows its check, label, shortcut and ▸;
// a `comingSoon` row is dimmed and inert, with "Coming soon" in the shortcut's place, and a row's note stands there too.
import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  CheckIcon,
  ChevronRightIcon,
  MenuTreeContext,
  useMenu,
  type MenuInitialFocus,
} from '@livedoc/ui';
import type {
  OfficeActions,
  OfficeEntry,
  OfficeItem,
  OfficeSubmenu,
} from '@/lib/office/office-catalogue';

import { contextMenuPlace, type Point } from '@/lib/office/context-menu-place';
import { OfficeSizeGrid } from './OfficeSizeGrid';
import type { ShortcutText } from '@/lib/office/shortcut-notation';

const PANEL =
  'z-40 min-w-64 rounded-md border border-(--office-line) bg-(--office-menu) py-1.5 text-sm text-(--office-ink) shadow-lg animate-fade-in motion-reduce:animate-none';

const ROW =
  'flex w-full items-center gap-3 py-1.5 pr-4 pl-2 text-left outline-none hover:bg-(--office-menu-hover) focus-visible:bg-(--office-menu-hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--office-focus)';

function Check({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className="flex w-5 shrink-0 justify-center text-(--office-icon)">
      {on ? <CheckIcon size={16} /> : null}
    </span>
  );
}

function ItemRow({
  item,
  actions,
  shortcutOf,
  onDone,
}: {
  item: OfficeItem;
  actions: OfficeActions;
  shortcutOf: (id: string) => ShortcutText | null;
  onDone: () => void;
}) {
  const action = actions[item.id];
  const soonId = useId();
  const soon = item.status === 'comingSoon' || !action;
  const inert = soon || action?.disabled === true;
  const shortcut = item.shortcut ? shortcutOf(item.shortcut) : null;
  const role =
    item.checkable === 'checkbox'
      ? 'menuitemcheckbox'
      : item.checkable === 'radio'
        ? 'menuitemradio'
        : 'menuitem';
  return (
    <button
      type="button"
      role={role}
      tabIndex={-1}
      aria-disabled={inert || undefined}
      aria-checked={item.checkable ? action?.checked === true : undefined}
      aria-describedby={soon || item.note ? soonId : undefined}
      aria-keyshortcuts={shortcut && !soon ? shortcut.aria : undefined}
      data-office-item={item.id}
      className={`${ROW} ${inert ? 'cursor-default opacity-50' : ''}`}
      onClick={() => {
        if (inert || !action) return;
        onDone();
        action.run();
      }}
    >
      <Check on={item.checkable !== undefined && action?.checked === true} />
      <span
        className="flex-1 whitespace-nowrap"
        style={
          item.face || item.faceStyle ? { fontFamily: item.face, ...item.faceStyle } : undefined
        }
      >
        {action?.label ?? item.label}
      </span>
      {soon ? (
        <span
          id={soonId}
          aria-hidden="true"
          className="whitespace-nowrap text-xs text-(--office-muted)"
        >
          Coming soon
        </span>
      ) : item.note ? (
        <span
          id={soonId}
          aria-hidden="true"
          className="whitespace-nowrap text-xs text-(--office-muted)"
        >
          {item.note}
        </span>
      ) : shortcut ? (
        <span aria-hidden="true" className="whitespace-nowrap text-(--office-muted)">
          {shortcut.shown}
        </span>
      ) : null}
    </button>
  );
}

function SubmenuRow({
  entry,
  toStart,
  actions,
  shortcutOf,
  onDone,
}: {
  entry: OfficeSubmenu;
  // Opens under its row, at the row's right: its menu sits at the window's right edge (More on a phone), with no room
  // beside it.
  toStart: boolean;
  actions: OfficeActions;
  shortcutOf: (id: string) => ShortcutText | null;
  onDone: () => void;
}) {
  // Opened by a hover it leaves focus where it is; by a press or a key it takes focus to its first item.
  const [open, setOpen] = useState<MenuInitialFocus | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  // A choice with a submenu (office-shell.md "Toolbar"): a press runs its choice; a key opens its submenu.
  const choice = entry.run ? actions[entry.run] : undefined;
  const current = entry.checkable !== undefined && choice?.checked === true;
  return (
    <div className="relative" onPointerLeave={() => setOpen(null)}>
      <button
        ref={setTrigger}
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        // A menu item with a submenu takes no check in ARIA; the choice at the caret is its current one.
        aria-current={current || undefined}
        data-office-submenu={entry.id}
        className={ROW}
        onPointerEnter={() => setOpen((o) => o ?? 'none')}
        onClick={(e) => {
          // A pointer's press has a click count; Enter and Space, which useMenu clicks with, have none.
          if (choice && e.detail > 0) {
            onDone();
            choice.run();
            return;
          }
          setOpen('first');
        }}
      >
        <Check on={current} />
        <span className="flex-1 whitespace-nowrap" style={entry.faceStyle}>
          {entry.label}
        </span>
        <span aria-hidden="true" className="text-(--office-icon)">
          <ChevronRightIcon size={16} />
        </span>
      </button>
      {open !== null ? (
        <OfficeMenuPanel
          entries={entry.entries}
          actions={actions}
          shortcutOf={shortcutOf}
          trigger={trigger}
          initialFocus={open}
          placement={toStart ? 'side-start' : 'side'}
          onClose={() => setOpen(null)}
          onDone={onDone}
        />
      ) : null}
    </div>
  );
}

export function OfficeMenuPanel({
  entries,
  actions,
  shortcutOf,
  trigger,
  initialFocus,
  placement,
  at,
  label,
  onClose,
  onDone,
}: {
  entries: readonly OfficeEntry[];
  actions: OfficeActions;
  shortcutOf: (id: string) => ShortcutText | null;
  trigger: HTMLElement | null;
  initialFocus: MenuInitialFocus;
  // Under a menu bar name, beside a submenu row, or at a point in the window (a context menu, at `at`).
  // `popup`: placed by the popup that holds it, scrolling when it is long (a font menu).
  placement: 'below' | 'below-end' | 'side' | 'side-start' | 'point' | 'popup';
  at?: Point;
  // Its name, when no trigger names it (a context menu).
  label?: string;
  // Closes this menu only.
  onClose: () => void;
  // An item ran: the whole menu closes.
  onDone: () => void;
}) {
  const { attach, surfaceProps, tree } = useMenu({ onClose, trigger, initialFocus, label });
  const panel = useRef<HTMLDivElement | null>(null);
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      attach(element);
      panel.current = element;
    },
    [attach],
  );
  // At a point: measured once drawn, then moved inside the window before it is painted.
  useLayoutEffect(() => {
    const element = panel.current;
    if (placement !== 'point' || !at || !element) return;
    const { left, top } = contextMenuPlace(
      at,
      { width: element.offsetWidth, height: element.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }, [placement, at]);
  // A long popup scrolls (a font menu); one holding submenus never does, so they are never cut off.
  const scrolls = !entries.some((entry) => entry.kind === 'submenu');
  const where =
    placement === 'popup'
      ? scrolls
        ? 'relative max-h-[70vh] overflow-y-auto'
        : 'relative'
      : placement === 'point'
        ? 'fixed'
        : placement === 'below'
          ? 'absolute top-full left-0 mt-0.5'
          : placement === 'below-end'
            ? 'absolute top-full right-0 mt-0.5'
            : placement === 'side-start'
              ? 'absolute top-full right-2'
              : 'absolute -top-1.5 left-full';
  return (
    <div
      ref={ref}
      {...surfaceProps}
      style={placement === 'point' ? { left: at?.x, top: at?.y } : undefined}
      className={`${PANEL} ${where}`}
    >
      <MenuTreeContext.Provider value={tree}>
        {entries.map((entry, index) =>
          entry.kind === 'separator' ? (
            <div
              key={`separator-${index}`}
              role="separator"
              className="my-1.5 border-t border-(--office-line)"
            />
          ) : entry.kind === 'submenu' ? (
            <SubmenuRow
              toStart={placement === 'below-end' || placement === 'side-start'}
              key={entry.id}
              entry={entry}
              actions={actions}
              shortcutOf={shortcutOf}
              onDone={onDone}
            />
          ) : entry.sizeGrid ? (
            <OfficeSizeGrid
              key={entry.id}
              item={entry}
              most={entry.sizeGrid}
              action={actions[entry.id]}
              onDone={onDone}
            />
          ) : (
            <ItemRow
              key={entry.id}
              item={entry}
              actions={actions}
              shortcutOf={shortcutOf}
              onDone={onDone}
            />
          ),
        )}
      </MenuTreeContext.Provider>
    </div>
  );
}
