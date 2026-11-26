// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef } from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import type { OfficeActions, OfficeCatalogue } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { TEXT_DOCUMENT_SHORTCUTS } from '@/lib/text-document/text-document-shortcuts';
import { OfficeTitleRow } from './OfficeTitleRow';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const CATALOGUE: OfficeCatalogue = [
  {
    id: 'file',
    label: 'File',
    entries: [
      { kind: 'item', id: 'make-a-copy', label: 'Make a copy', level: 'view', status: 'built' },
      { kind: 'item', id: 'rename', label: 'Rename', level: 'edit', status: 'comingSoon' },
      {
        kind: 'submenu',
        id: 'download',
        label: 'Download',
        entries: [
          {
            kind: 'item',
            id: 'download-odt',
            label: 'OpenDocument (.odt)',
            level: 'view',
            status: 'built',
          },
        ],
      },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    entries: [
      { kind: 'item', id: 'undo', label: 'Undo', level: 'edit', status: 'built', shortcut: 'undo' },
      {
        kind: 'item',
        id: 'ruler',
        label: 'Show ruler',
        level: 'view',
        status: 'built',
        checkable: 'checkbox',
      },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    entries: [
      {
        kind: 'item',
        id: 'search-the-menus',
        label: 'Search the menus',
        level: 'view',
        status: 'built',
        shortcut: 'tool-finder',
      },
    ],
  },
];

function Shell({ actions, level = 'edit' }: { actions: OfficeActions; level?: AccessLevel }) {
  const root = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={root} data-testid="surface">
      <OfficeTitleRow
        name="Notes"
        format=".ODT"
        formatTitle="OpenDocument format"
        problem={null}
        catalogue={CATALOGUE}
        level={level}
        actions={actions}
        shortcuts={TEXT_DOCUMENT_SHORTCUTS}
        keyScope={root}
        telemetryKind="TextDocument"
      />
      <p data-testid="body" tabIndex={0}>
        Body
      </p>
    </div>
  );
}

const ACTIONS = (): OfficeActions => ({
  'make-a-copy': { run: vi.fn() },
  'download-odt': { run: vi.fn() },
  undo: { run: vi.fn() },
  ruler: { run: vi.fn(), checked: true },
});

const name = (label: string) =>
  within(screen.getByRole('menubar')).getByRole('menuitem', { name: label });

// docs/specs/004-interface-design/office-shell.md "Menu bar".
describe('OfficeMenuBar', () => {
  it('draws one menubar, one tab stop, a name per menu', () => {
    render(<Shell actions={ACTIONS()} />);
    expect(screen.getByRole('menubar', { name: 'Menu bar' })).toBeTruthy();
    expect(name('File').tabIndex).toBe(0);
    expect(name('Edit').tabIndex).toBe(-1);
    expect(name('File').getAttribute('aria-haspopup')).toBe('menu');
  });

  it('moves between names with Left and Right, wrapping, and Home and End', () => {
    render(<Shell actions={ACTIONS()} />);
    name('File').focus();
    fireEvent.keyDown(name('File'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(name('Help'));
    fireEvent.keyDown(name('Help'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(name('File'));
    fireEvent.keyDown(name('File'), { key: 'End' });
    expect(document.activeElement).toBe(name('Help'));
    fireEvent.keyDown(name('Help'), { key: 'Home' });
    expect(document.activeElement).toBe(name('File'));
  });

  it('opens a menu on Down with focus on its first item, and Escape gives focus back to its name', () => {
    render(<Shell actions={ACTIONS()} />);
    name('File').focus();
    fireEvent.keyDown(name('File'), { key: 'ArrowDown' });
    const menu = screen.getByRole('menu');
    expect(document.activeElement).toBe(
      within(menu).getByRole('menuitem', { name: 'Make a copy' }),
    );
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(name('File'));
  });

  it('opens the next menu with Right while one is open', () => {
    render(<Shell actions={ACTIONS()} />);
    fireEvent.click(name('File'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(name('Edit').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.textContent).toContain('Undo');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(document.activeElement).toBe(name('Edit'));
  });

  it('switches menu on hover once one is open, never before', () => {
    render(<Shell actions={ACTIONS()} />);
    fireEvent.pointerEnter(name('Edit'));
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(name('File'));
    fireEvent.pointerEnter(name('Edit'));
    expect(name('Edit').getAttribute('aria-expanded')).toBe('true');
    expect(name('File').getAttribute('aria-expanded')).toBe('false');
  });

  it('runs a built item and closes; a coming-soon item is dimmed, described and inert', () => {
    const actions = ACTIONS();
    render(<Shell actions={actions} />);
    fireEvent.click(name('File'));
    const rename = screen.getByRole('menuitem', { name: 'Rename' });
    expect(rename.getAttribute('aria-disabled')).toBe('true');
    expect(rename.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(rename.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Coming soon',
    );
    fireEvent.click(rename);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Make a copy' }));
    expect(actions['make-a-copy']!.run).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('draws a dimmed item’s note in its row and its hint as its hover card and description', () => {
    const run = vi.fn();
    const hint = "This can't be suggested yet. An Editor changes it in Editing.";
    render(
      <Shell
        actions={{ ...ACTIONS(), undo: { run, disabled: true, note: 'Editing only', hint } }}
      />,
    );
    fireEvent.click(name('Edit'));
    // Its name stays its label: the note and hint describe it, never name it.
    const undo = screen.getByRole('menuitem', { name: 'Undo' });
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(undo.textContent).toContain('Editing only');
    const described = undo.getAttribute('aria-describedby')!.split(' ');
    expect(described.map((id) => document.getElementById(id)?.textContent)).toContain(hint);
    fireEvent.click(undo);
    expect(run).not.toHaveBeenCalled();
  });

  it('opens a submenu with Right, its first item focused, and runs from it', () => {
    const actions = ACTIONS();
    render(<Shell actions={actions} />);
    fireEvent.click(name('File'));
    const download = screen.getByRole('menuitem', { name: 'Download' });
    download.focus();
    fireEvent.keyDown(download, { key: 'ArrowRight' });
    const odt = screen.getByRole('menuitem', { name: 'OpenDocument (.odt)' });
    expect(document.activeElement).toBe(odt);
    fireEvent.click(odt);
    expect(actions['download-odt']!.run).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  // office-shell.md "Menu bar": a submenu that would cross the window's bottom edge moves up until it fits.
  it('moves a submenu crossing the bottom edge up, and leaves one that fits', () => {
    const drawn = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ top: 600, bottom: 926 } as DOMRect);
    vi.stubGlobal('innerHeight', 900);
    render(<Shell actions={ACTIONS()} />);
    fireEvent.click(name('File'));
    const download = screen.getByRole('menuitem', { name: 'Download' });
    download.focus();
    fireEvent.keyDown(download, { key: 'ArrowRight' });
    const submenu = () => screen.getByRole('menu', { name: 'Download' });
    expect(submenu().style.translate).toBe('0px -34px');
    fireEvent.keyDown(submenu(), { key: 'ArrowLeft' });
    drawn.mockReturnValue({ top: 100, bottom: 400 } as DOMRect);
    fireEvent.keyDown(download, { key: 'ArrowRight' });
    expect(submenu().style.translate).toBe('');
    drawn.mockRestore();
    vi.unstubAllGlobals();
  });

  it('shows a check and a shortcut, named for assistive technology', () => {
    render(<Shell actions={ACTIONS()} />);
    fireEvent.click(name('Edit'));
    const ruler = screen.getByRole('menuitemcheckbox', { name: 'Show ruler' });
    expect(ruler.getAttribute('aria-checked')).toBe('true');
    const undo = screen.getByRole('menuitem', { name: 'Undo' });
    expect(undo.getAttribute('aria-keyshortcuts')).toBe('Control+Z');
    expect(undo.textContent).toContain('Ctrl+Z');
  });

  it('shows only what the level may see', () => {
    render(<Shell actions={ACTIONS()} level="view" />);
    fireEvent.click(name('File'));
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull();
    fireEvent.click(name('File'));
    fireEvent.click(name('Edit'));
    expect(screen.queryByRole('menuitem', { name: 'Undo' })).toBeNull();
  });

  it('opens a menu with its access key from anywhere in the surface (Alt+Shift+letter outside Chrome)', () => {
    render(<Shell actions={ACTIONS()} />);
    const body = screen.getByTestId('body');
    body.focus();
    fireEvent.keyDown(body, { code: 'KeyF', key: 'F', altKey: true, shiftKey: true });
    expect(name('File').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.textContent).toContain('Make a copy');
  });

  it('counts a menu opened, never what is in it', () => {
    render(<Shell actions={ACTIONS()} />);
    fireEvent.click(name('Edit'));
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'TextDocumentMenuEdit');
  });

  it('runs a built item from its shortcut', async () => {
    const actions = ACTIONS();
    render(<Shell actions={actions} />);
    await act(async () => {});
    fireEvent.keyDown(screen.getByTestId('body'), { code: 'KeyZ', key: 'z', ctrlKey: true });
    expect(actions.undo!.run).toHaveBeenCalledOnce();
  });
});
