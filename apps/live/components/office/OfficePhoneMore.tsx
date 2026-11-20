'use client';

// More (⋮) in the office title row on a phone (docs/specs/004-interface-design/office-shell.md "Phone and tablet"): the
// kind's menus, each a submenu in the menu bar's order, then the document's own parts the row has no room for: Star,
// Settings and the account. Drawn only on a phone; the desktop row has them all in sight.
import { useMemo } from 'react';
import { Glyph, Prims, useMenuButton } from '@livedoc/ui';
import { lucideEllipsisVertical } from '@livedoc/icons/lucide';
import type {
  OfficeActions,
  OfficeEntry,
  OfficeItem,
  OfficeMenu,
} from '@/lib/office/office-catalogue';
import type { ShortcutText } from '@/lib/office/shortcut-notation';
import type { OfficeChrome } from './office-chrome';
import { OFFICE_ICON_BUTTON } from './OfficeTitleActions';
import { OfficeMenuPanel } from './OfficeMenuPanel';

const own = (id: string, label: string): OfficeItem => ({
  kind: 'item',
  id,
  label,
  level: 'view',
  status: 'built',
});

export function OfficePhoneMore({
  menus,
  chrome,
  actions,
  shortcutOf,
}: {
  menus: readonly OfficeMenu[];
  chrome: OfficeChrome | null;
  actions: OfficeActions;
  shortcutOf: (id: string) => ShortcutText | null;
}) {
  const { open, close, toggle, trigger, setTrigger, onTriggerKeyDown } = useMenuButton();

  // The document's own parts, bound where the session has them; an unbound one is not drawn.
  const { entries, bound } = useMemo(() => {
    const parts: Record<string, OfficeActions[string]> = {};
    const items: OfficeItem[] = [];
    if (chrome?.star) {
      const { star } = chrome;
      items.push(own('phone-star', star.starred ? 'Starred' : 'Star'));
      parts['phone-star'] = { run: star.onToggle, checked: star.starred };
    }
    if (chrome) {
      items.push(own('phone-settings', 'Settings'), own('phone-account', 'Account'));
      parts['phone-settings'] = { run: chrome.onOpenSettings };
      parts['phone-account'] = { run: chrome.onOpenAccount };
    }
    const list: OfficeEntry[] = [
      ...menus.map((menu): OfficeEntry => ({
        kind: 'submenu',
        id: `phone-${menu.id}`,
        label: menu.label,
        entries: menu.entries,
      })),
      ...(items.length > 0 ? [{ kind: 'separator' } as const, ...items] : []),
    ];
    return { entries: list, bound: { ...actions, ...parts } };
  }, [menus, chrome, actions]);

  return (
    <div className="relative hidden phone:block">
      <button
        ref={setTrigger}
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        className={OFFICE_ICON_BUTTON}
      >
        <Glyph size={20} units={24}>
          <Prims prims={lucideEllipsisVertical} />
        </Glyph>
      </button>
      {open ? (
        <OfficeMenuPanel
          entries={entries}
          actions={bound}
          shortcutOf={shortcutOf}
          trigger={trigger}
          initialFocus="first"
          placement="below-end"
          onClose={close}
          onDone={close}
        />
      ) : null}
    </div>
  );
}
