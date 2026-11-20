// @vitest-environment jsdom
// docs/specs/004-interface-design/fonts.md "The font menu", "More fonts".
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { readRecentFonts } from '@/lib/office/office-recent-fonts';
import { readMyFonts, writeMyFonts } from '@/lib/office/office-my-fonts';
import { createGoogleFontLoads } from '@/lib/document-fonts/google-font-loading';
import { OfficeFontMenu } from './OfficeFontMenu';

const { track, loadGoogleFamilies, loads } = vi.hoisted(() => ({
  track: vi.fn(),
  loadGoogleFamilies: vi.fn(async (_names: readonly string[]) => {}),
  loads: { current: null as ReturnType<typeof createGoogleFontLoads> | null },
}));
vi.mock('@/lib/telemetry', () => ({ track }));
vi.mock('@/lib/document-fonts/google-families', () => ({ loadGoogleFamilies }));
vi.mock('@/lib/document-fonts/google-font-loading', async (actual) => {
  const real = await actual<typeof import('@/lib/document-fonts/google-font-loading')>();
  loads.current = real.createGoogleFontLoads(vi.fn(async () => new Response('')));
  return { ...real, googleFontLoads: () => loads.current! };
});
vi.mock('@/lib/document-fonts/google-font-catalogue', async (actual) => ({
  ...(await actual<typeof import('@/lib/document-fonts/google-font-catalogue')>()),
  loadGoogleFonts: async () => [
    {
      name: 'Rubik',
      category: 'Sans Serif',
      popularity: 1,
      trending: 1,
      dateAdded: '2015-01-01',
      axes: '',
    },
  ],
}));

afterEach(() => {
  localStorage.clear();
  track.mockClear();
  loadGoogleFamilies.mockClear();
});

function setup(value: string | null, telemetryKind?: string) {
  const font = { read: () => value, set: vi.fn(), ...(telemetryKind ? { telemetryKind } : {}) };
  render(<OfficeFontMenu font={font} value={value} tabIndex={0} className="" />);
  return { font, button: screen.getByRole('button', { name: value ? `Font: ${value}` : 'Font' }) };
}

// Settles a stylesheet the loads were asked for, as the browser would.
function settle(name: string, event: 'load' | 'error') {
  act(() => {
    loads.current!.load({
      name,
      category: 'Sans Serif',
      popularity: 1,
      trending: 1,
      dateAdded: '2015-01-01',
      axes: '',
    });
    document.head
      .querySelector(`link[data-google-font="${name}"]`)!
      .dispatchEvent(new Event(event));
  });
}

describe('OfficeFontMenu', () => {
  it('shows the family at the caret', () => {
    const { button } = setup('Lora');
    expect(button.textContent).toBe('Lora');
    expect((button.firstChild as HTMLElement).className).not.toContain('italic');
  });

  it('shows nothing over a mixed selection', () => {
    const { button } = setup(null);
    expect(button.textContent).toBe('');
  });

  it('keeps My fonts without telling, for a kind with no telemetry name', async () => {
    const { button } = setup('Arial');
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('menuitem', { name: 'More fonts' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Rubik' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(readMyFonts()).toContain('Rubik');
    expect(track).not.toHaveBeenCalled();
  });

  it('shows a family the menu does not list in italics', () => {
    const { button } = setup('Calibri');
    expect((button.firstChild as HTMLElement).className).toContain('italic');
  });

  it('shows a family from Google Fonts as itself once it has loaded', () => {
    const { button } = setup('Inter');
    expect((button.firstChild as HTMLElement).className).toContain('italic');
    settle('Inter', 'load');
    expect((button.firstChild as HTMLElement).className).not.toContain('italic');
  });

  it('opens over the page with More fonts and My fonts, the one at the caret checked', () => {
    const { button } = setup('Georgia');
    fireEvent.click(button);
    const menu = screen.getByRole('menu');
    expect(menu.closest('[data-office-popup]')).not.toBeNull();
    expect(
      within(menu).getByRole('menuitem', { name: 'More fonts' }).getAttribute('aria-disabled'),
    ).toBeNull();
    const georgia = within(menu).getByRole('menuitemradio', { name: 'Georgia' });
    expect(georgia.getAttribute('aria-checked')).toBe('true');
    expect((georgia.querySelector('span[style]') as HTMLElement).style.fontFamily).toContain(
      'Gelasio',
    );
    fireEvent.click(button);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lists this browser’s My fonts and loads those from Google Fonts as it opens', () => {
    writeMyFonts(['Lora', 'Rubik']);
    const { button } = setup('Lora');
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((i) => i.textContent),
    ).toEqual(['Lora', 'Rubik']);
    expect(loadGoogleFamilies).toHaveBeenCalledWith(['Lora', 'Rubik']);
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(screen.getAllByRole('menu')).toHaveLength(1);
  });

  it('marks a family that could not load', () => {
    writeMyFonts(['Lora', 'Nosuch']);
    const { button } = setup('Lora');
    settle('Nosuch', 'error');
    fireEvent.click(button);
    const row = screen.getByRole('menuitemradio', { name: 'Nosuch' });
    expect(row.textContent).toContain('Not available offline');
    expect(document.getElementById(row.getAttribute('aria-describedby')!)!.textContent).toBe(
      'Not available offline',
    );
  });

  it('chooses a family, remembers it among the recent ones, and closes', () => {
    const { button, font } = setup('Arial');
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Roboto' }));
    expect(font.set).toHaveBeenCalledWith('Roboto');
    expect(readRecentFonts()).toEqual(['Roboto']);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(screen.getAllByRole('menuitemradio', { name: 'Roboto' })).toHaveLength(2);
  });

  it('opens More fonts, and its OK keeps My fonts for the menu', async () => {
    const { button } = setup('Arial', 'TextDocument');
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('menuitem', { name: 'More fonts' }));
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'TextDocumentMoreFonts');
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(await screen.findByRole('option', { name: 'Rubik' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(readMyFonts()).toContain('Rubik');
    expect(track).toHaveBeenCalledWith('UI', 'Changed', 'TextDocumentMyFonts');
    expect(loadGoogleFamilies).toHaveBeenLastCalledWith(expect.arrayContaining(['Rubik']));
    fireEvent.click(button);
    expect(screen.getByRole('menuitemradio', { name: 'Rubik' })).toBeTruthy();
  });

  it('keeps nothing and tells nothing when OK changes nothing, or on Cancel', async () => {
    const { button } = setup('Arial');
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('menuitem', { name: 'More fonts' }));
    await screen.findByRole('listbox');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('menuitem', { name: 'More fonts' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Rubik' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(track).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
});
