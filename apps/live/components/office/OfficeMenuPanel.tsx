'use client';

// One open menu of the office shell (docs/specs/004-interface-design/office-shell.md "Menu bar"): a command menu on
// the shared keyboard model (useMenu), drawn from the kind's catalogue. A row shows its check, label, shortcut and ▸;
// a `comingSoon` row is dimmed and inert, with "Coming soon" in the shortcut's place.
import { useId, useState } from 'react';
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

import type { ShortcutText } from '@/lib/office/shortcut-notation';

const PANEL =
  'absolute z-40 min-w-64 rounded-md border border-(--office-line) bg-(--office-menu) py-1.5 text-sm text-(--office-ink) shadow-lg animate-fade-in motion-reduce:animate-none';

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
      aria-describedby={soon ? soonId : undefined}
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
      <span className="flex-1 whitespace-nowrap">{item.label}</span>
      {soon ? (
        <span
          id={soonId}
          aria-hidden="true"
          className="whitespace-nowrap text-xs text-(--office-muted)"
        >
          Coming soon
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
  actions,
  shortcutOf,
  onDone,
}: {
  entry: OfficeSubmenu;
  actions: OfficeActions;
  shortcutOf: (id: string) => ShortcutText | null;
  onDone: () => void;
}) {
  // Opened by a hover it leaves focus where it is; by a press or a key it takes focus to its first item.
  const [open, setOpen] = useState<MenuInitialFocus | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  return (
    <div className="relative" onPointerLeave={() => setOpen(null)}>
      <button
        ref={setTrigger}
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        data-office-submenu={entry.id}
        className={ROW}
        onPointerEnter={() => setOpen((o) => o ?? 'none')}
        onClick={() => setOpen('first')}
      >
        <Check on={false} />
        <span className="flex-1 whitespace-nowrap">{entry.label}</span>
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
          placement="side"
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
  onClose,
  onDone,
}: {
  entries: readonly OfficeEntry[];
  actions: OfficeActions;
  shortcutOf: (id: string) => ShortcutText | null;
  trigger: HTMLElement | null;
  initialFocus: MenuInitialFocus;
  // Under a menu bar name, or beside a submenu row.
  placement: 'below' | 'side';
  // Closes this menu only.
  onClose: () => void;
  // An item ran: the whole menu closes.
  onDone: () => void;
}) {
  const { attach, surfaceProps, tree } = useMenu({ onClose, trigger, initialFocus });
  return (
    <div
      ref={attach}
      {...surfaceProps}
      className={`${PANEL} ${placement === 'below' ? 'top-full left-0 mt-0.5' : '-top-1.5 left-full'}`}
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
              key={entry.id}
              entry={entry}
              actions={actions}
              shortcutOf={shortcutOf}
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
