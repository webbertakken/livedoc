'use client';

// The office shell's menu bar (docs/specs/004-interface-design/office-shell.md "Menu bar"): the WAI-ARIA menubar, one
// tab stop, arrows between its names, each name opening its menu from the kind's catalogue. Which menu is open is the
// shell's (`openMenu`), so an access key or the tool finder can open one too.
import { useRef, useState, type KeyboardEvent } from 'react';
import type { MenuInitialFocus } from '@livedoc/ui';
import type { OfficeActions, OfficeMenu } from '@/lib/office/office-catalogue';
import type { ShortcutText } from '@/lib/office/shortcut-notation';
import { OfficeMenuPanel } from './OfficeMenuPanel';

export type OpenMenu = { id: string; focus: MenuInitialFocus } | null;

const NAME =
  'rounded px-2 py-0.5 text-sm text-(--office-ink) outline-none hover:bg-(--office-hover) focus-visible:outline-2 focus-visible:outline-(--office-focus) aria-expanded:bg-(--office-hover)';

export function OfficeMenuBar({
  menus,
  actions,
  shortcutOf,
  openMenu,
  onOpenMenu,
  onCloseMenu,
  label,
}: {
  menus: readonly OfficeMenu[];
  actions: OfficeActions;
  shortcutOf: (id: string) => ShortcutText | null;
  openMenu: OpenMenu;
  onOpenMenu: (menu: OpenMenu) => void;
  // Closes that menu if it is still the one open: a menu that closes as another opens closes only itself.
  onCloseMenu: (id: string) => void;
  // The bar's name for assistive technology ("Menu bar").
  label: string;
}) {
  const names = useRef<(HTMLButtonElement | null)[]>([]);
  // The one tab stop: the open menu's name, else the first.
  const openIndex = menus.findIndex((m) => m.id === openMenu?.id);
  const stop = openIndex >= 0 ? openIndex : 0;

  const focusName = (index: number) => names.current[index]?.focus();
  const step = (from: number, by: number) => (from + by + menus.length) % menus.length;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const from = names.current.findIndex((n) => n === document.activeElement);
    const inMenu = from < 0;
    const at = inMenu ? openIndex : from;
    if (at < 0) return;
    let to: number | null = null;
    if (e.key === 'ArrowRight') to = step(at, 1);
    else if (e.key === 'ArrowLeft') to = step(at, -1);
    else if (!inMenu && e.key === 'Home') to = 0;
    else if (!inMenu && e.key === 'End') to = menus.length - 1;
    if (to !== null) {
      e.preventDefault();
      // On the bar, focus only moves. In an open menu the next one opens, its name focused first, so Escape in it
      // goes back to that name.
      focusName(to);
      if (inMenu) onOpenMenu({ id: menus[to]!.id, focus: 'first' });
      return;
    }
    if (!inMenu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      onOpenMenu({ id: menus[at]!.id, focus: e.key === 'ArrowDown' ? 'first' : 'last' });
    }
  };

  return (
    <div
      role="menubar"
      aria-label={label}
      className="flex items-center gap-0.5"
      onKeyDown={onKeyDown}
    >
      {menus.map((menu, index) => (
        <MenuName
          key={menu.id}
          menu={menu}
          open={openMenu?.id === menu.id ? openMenu.focus : null}
          anyOpen={openMenu !== null}
          tabStop={index === stop}
          nameRef={(el) => {
            names.current[index] = el;
          }}
          actions={actions}
          shortcutOf={shortcutOf}
          onOpenMenu={onOpenMenu}
          onCloseMenu={onCloseMenu}
        />
      ))}
    </div>
  );
}

// One name on the bar and, while it is open, its menu; the name is the menu's trigger.
function MenuName({
  menu,
  open,
  anyOpen,
  tabStop,
  nameRef,
  actions,
  shortcutOf,
  onOpenMenu,
  onCloseMenu,
}: {
  menu: OfficeMenu;
  // Where focus goes in it, while it is open.
  open: MenuInitialFocus | null;
  anyOpen: boolean;
  tabStop: boolean;
  nameRef: (el: HTMLButtonElement | null) => void;
  actions: OfficeActions;
  shortcutOf: (id: string) => ShortcutText | null;
  onOpenMenu: (menu: OpenMenu) => void;
  onCloseMenu: (id: string) => void;
}) {
  const [name, setName] = useState<HTMLButtonElement | null>(null);
  return (
    <div className="relative">
      <button
        ref={(el) => {
          setName(el);
          nameRef(el);
        }}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open !== null}
        tabIndex={tabStop ? 0 : -1}
        data-office-menu={menu.id}
        className={NAME}
        onClick={() => onOpenMenu(open !== null ? null : { id: menu.id, focus: 'first' })}
        // While a menu is open, hovering another name opens that one, without taking focus.
        onPointerEnter={() => {
          if (anyOpen && open === null) onOpenMenu({ id: menu.id, focus: 'none' });
        }}
      >
        {menu.label}
      </button>
      {open !== null ? (
        <OfficeMenuPanel
          entries={menu.entries}
          actions={actions}
          shortcutOf={shortcutOf}
          trigger={name}
          initialFocus={open}
          placement="below"
          onClose={() => onCloseMenu(menu.id)}
          onDone={() => onCloseMenu(menu.id)}
        />
      ) : null}
    </div>
  );
}
