// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { OfficeMenu } from '@/lib/office/office-catalogue';
import type { OfficeChrome } from './office-chrome';
import { OfficePhoneMore } from './OfficePhoneMore';

const MENUS: OfficeMenu[] = [
  {
    id: 'file',
    label: 'File',
    entries: [{ kind: 'item', id: 'rename', label: 'Rename', level: 'edit', status: 'built' }],
  },
  {
    id: 'edit',
    label: 'Edit',
    entries: [{ kind: 'item', id: 'undo', label: 'Undo', level: 'edit', status: 'built' }],
  },
];

function chromeOf(): OfficeChrome {
  return {
    back: { kind: 'explorer' },
    rename: vi.fn(),
    renameNonce: 0,
    star: { starred: true, onToggle: vi.fn() },
    move: null,
    share: null,
    makeCopy: null,
    copy: null,
    onOpenSettings: vi.fn(),
    onOpenAccount: vi.fn(),
    people: [],
    onOpenTab: vi.fn(),
    trash: null,
    facts: {
      owner: { you: true },
      location: { place: 'mine', folders: [] },
      createdAt: null,
      savedAt: null,
    },
  };
}

// docs/specs/004-interface-design/office-shell.md "Phone and tablet": the menus live in More.
describe('OfficePhoneMore', () => {
  it('holds the menus as submenus, then Starred, Settings and Account', () => {
    const chrome = chromeOf();
    render(
      <OfficePhoneMore
        menus={MENUS}
        chrome={chrome}
        actions={{ rename: { run: vi.fn() }, undo: { run: vi.fn() } }}
        shortcutOf={() => null}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['File', 'Edit', 'Starred', 'Settings', 'Account']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Settings' }));
    expect(chrome.onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('opens a menu of the kind from its submenu', () => {
    const undo = vi.fn();
    render(
      <OfficePhoneMore
        menus={MENUS}
        chrome={chromeOf()}
        actions={{ rename: { run: vi.fn() }, undo: { run: undo } }}
        shortcutOf={() => null}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Undo' }));
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
