// @vitest-environment jsdom
// docs/specs/029-sheets/keyboard-shortcuts.md; surface.md "Menu bar": every built row runs through the shell's layer on
// each platform, the surface's rows pass on to the grid, items show their keys and Ctrl+/ opens the shortcuts dialog.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef } from 'react';
import { catalogueItems, type OfficeActions } from '@/lib/office/office-catalogue';
import { parseShortcut, type KeyStep, type OfficePlatform } from '@/lib/office/shortcut-notation';
import { spreadsheetMenus } from '@/lib/spreadsheet/spreadsheet-menus';
import { SPREADSHEET_SHORTCUTS } from '@/lib/spreadsheet/spreadsheet-shortcuts';
import { createOfficeBindingsChannel } from './office-bindings-channel';
import type { ShowFormulas } from '@/components/sheets/show-formulas';
import { SpreadsheetTitleRow } from './SpreadsheetTitleRow';
import { useSpreadsheetZoom } from './spreadsheet-zoom';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const SCOPE = { ownerId: 'o1', documentId: 'd1', shareCode: null };
const NAVIGATOR_PLATFORM: Record<OfficePlatform, string> = {
  pc: 'Win32',
  mac: 'MacIntel',
  chromeos: 'CrOS',
};

afterEach(() => vi.restoreAllMocks());

function Row({
  channel,
  formulas,
}: {
  channel: ReturnType<typeof createOfficeBindingsChannel>;
  formulas: ShowFormulas;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  const { zoom } = useSpreadsheetZoom();
  return (
    <div ref={root} data-testid="surface">
      <SpreadsheetTitleRow
        scope={SCOPE}
        tabId="t1"
        format="ods"
        documentName="Budget"
        level="edit"
        history={null}
        channel={channel}
        zoom={zoom}
        formulas={formulas}
        keyScope={root}
        onWorkbook={undefined}
        pushUndo={vi.fn()}
      />
    </div>
  );
}

// The open sheet's items, each a spy, as the grid publishes them through the channel.
function renderOn(platform: OfficePlatform) {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(NAVIGATOR_PLATFORM[platform]);
  const channel = createOfficeBindingsChannel();
  const items = catalogueItems(spreadsheetMenus('ods')).map(({ item }) => item);
  const actions: OfficeActions = Object.fromEntries(
    items.filter((item) => item.shortcut).map((item) => [item.id, { run: vi.fn() }]),
  );
  // Show › Formulas is the surface's own, bound in the title row: its toggle is the item's spy.
  const toggle = actions['show-formulas']!.run;
  render(<Row channel={channel} formulas={{ shown: false, toggle }} />);
  act(() => {
    channel.set({ actions, fontSize: 10, setFontSize: () => {} });
  });
  return { actions, items, surface: screen.getByTestId('surface') };
}

const press = (surface: HTMLElement, { mods, code }: KeyStep) =>
  fireEvent.keyDown(surface, {
    code,
    ctrlKey: mods.includes('ctrl'),
    altKey: mods.includes('alt'),
    shiftKey: mods.includes('shift'),
    metaKey: mods.includes('meta'),
  });

const BUILT = SPREADSHEET_SHORTCUTS.filter((row) => row.status === 'built');
// Built rows the shell runs itself rather than through one of the sheet's items.
const SHELL_ROWS = new Set(['tool-finder', 'open', 'show-common-keyboard-shortcuts']);

describe('the spreadsheet shortcut layer', () => {
  it.each(['pc', 'mac', 'chromeos'] as const)(
    "runs every built row's item by each of its ways on %s",
    (platform) => {
      const { actions, items, surface } = renderOn(platform);
      for (const row of BUILT.filter((r) => !SHELL_ROWS.has(r.id) && !r.id.endsWith('-menu'))) {
        const item = items.find((i) => i.shortcut === row.id)!;
        const run = actions[item.id]!.run as ReturnType<typeof vi.fn>;
        for (const way of parseShortcut(row.keys[platform])) {
          run.mockClear();
          expect(press(surface, way.steps[0]!), `${row.keys[platform]}`).toBe(false);
          expect(run, `${row.id} by ${row.keys[platform]} on ${platform}`).toHaveBeenCalledTimes(1);
        }
      }
    },
  );

  it.each(['pc', 'mac', 'chromeos'] as const)(
    'opens each menu by its Alt key on %s',
    (platform) => {
      const { surface } = renderOn(platform);
      for (const row of BUILT.filter((r) => r.id.endsWith('-menu'))) {
        // jsdom is not Chrome: the other browsers' way.
        const way = parseShortcut(row.keys[platform]).find((w) => w.browser !== 'chrome')!;
        act(() => {
          press(surface, way.steps[0]!);
        });
        const name = row.action.replace(/ menu$/, '');
        expect(screen.getByRole('menu', { name })).toBeTruthy();
        fireEvent.keyDown(screen.getByRole('menu', { name }), { key: 'Escape' });
      }
    },
  );

  it('opens the tool finder, the file picker and the shortcuts dialog by their keys', () => {
    const { surface } = renderOn('pc');
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    press(surface, { mods: ['ctrl'], code: 'KeyO' });
    expect(click).toHaveBeenCalledTimes(1);
    press(surface, { mods: ['alt'], code: 'Slash' });
    expect(screen.getByRole('combobox', { name: 'Search the menus' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search the menus' }), {
      key: 'Escape',
    });
    press(surface, { mods: ['ctrl'], code: 'Slash' });
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    // A key the grid hears itself is listed as working, never coming soon.
    const row = within(dialog).getByText('Select column').closest('div')!;
    expect(row.textContent).toContain('Ctrl+Space');
    expect(row.textContent).not.toMatch(/coming soon/i);
    expect(within(dialog).getByText('Fill range').textContent).not.toMatch(/coming soon/i);
    expect(within(dialog).getByText(/^Save/).textContent).toMatch(/coming soon/i);
  });

  it("leaves the surface's keys to the grid and the editor: nothing runs, nothing is prevented", () => {
    const { actions, surface } = renderOn('pc');
    for (const [code, mods] of [
      ['KeyZ', ['ctrl']],
      ['KeyY', ['ctrl']],
      ['KeyV', ['ctrl', 'shift']],
      ['KeyH', ['ctrl']],
    ] as const)
      expect(press(surface, { mods: [...mods], code })).toBe(true);
    for (const id of ['undo', 'redo', 'paste-values-only', 'find-and-replace'])
      expect(actions[id]!.run).not.toHaveBeenCalled();
  });

  it('shows each item its keys: Edit › Undo and Copy', () => {
    renderOn('pc');
    fireEvent.click(within(screen.getByRole('menubar')).getByRole('menuitem', { name: 'Edit' }));
    expect(screen.getByRole('menuitem', { name: /^Undo/ }).textContent).toContain('Ctrl+Z');
    expect(screen.getByRole('menuitem', { name: /^Copy/ }).textContent).toContain('Ctrl+C');
  });
});
