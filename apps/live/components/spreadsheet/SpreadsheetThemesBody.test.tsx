// @vitest-environment jsdom
// formatting.md "Themes" (D217): the Themes panel applies a theme at once, customises its font and colours as Custom,
// and says when one could not be saved; the surface's theme state saves it with the workbook's settings.
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SPREADSHEET_THEMES,
  STANDARD_THEME,
  WorkbookRecord,
  type SpreadsheetTheme,
} from '@livedoc/sheets';
import { apiSaveWorkbookSettings } from '@/lib/api/workbook';
import { SpreadsheetThemesBody, THEME_NOT_SAVED } from './SpreadsheetThemesBody';
import {
  SpreadsheetThemeProvider,
  useSpreadsheetTheme,
  useSpreadsheetThemeState,
} from './spreadsheet-theme-context';

vi.mock('@/lib/api/workbook', () => ({ apiSaveWorkbookSettings: vi.fn() }));
afterEach(cleanup);

function show(theme: SpreadsheetTheme, saved = true) {
  const choose = vi.fn(async () => saved);
  render(
    <SpreadsheetThemeProvider value={{ theme, choose }}>
      <SpreadsheetThemesBody />
    </SpreadsheetThemeProvider>,
  );
  return choose;
}

describe('the Themes panel', () => {
  it('lists the themes, the one in use pressed, and applies one at once', async () => {
    const choose = show(STANDARD_THEME);
    const themes = screen.getByRole('group', { name: 'Themes' });
    expect(within(themes).getAllByRole('button')).toHaveLength(8);
    expect(
      within(themes).getByRole('button', { name: 'Standard' }).getAttribute('aria-pressed'),
    ).toBe('true');
    await act(async () => fireEvent.click(within(themes).getByRole('button', { name: 'Ocean' })));
    expect(choose).toHaveBeenCalledWith(SPREADSHEET_THEMES[2]);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('says a theme could not be saved', async () => {
    show(STANDARD_THEME, false);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mono' })));
    expect(screen.getByRole('alert').textContent).toBe(THEME_NOT_SAVED);
  });
  it('customises the font and a colour as Custom, and returns on Done', async () => {
    const choose = show({ ...STANDARD_THEME, font: 'Wingdings' });
    fireEvent.click(screen.getByRole('button', { name: 'Customise' }));
    const font = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Font' });
    expect(font.value).toBe('Wingdings');
    await act(async () => fireEvent.change(font, { target: { value: 'Roboto' } }));
    expect(choose).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'custom', font: 'Roboto' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Accent 1' }));
    const picker = screen.getByRole('dialog', { name: /Accent 1/ });
    const swatch = within(picker)
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-pressed') === 'false')!;
    await act(async () => fireEvent.click(swatch));
    expect(choose).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'custom',
        colours: expect.objectContaining({ text: '#000000' }),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('group', { name: 'Themes' })).toBeTruthy();
  });
  it('offers Arial among the fonts for a theme using it', () => {
    show(STANDARD_THEME);
    fireEvent.click(screen.getByRole('button', { name: 'Customise' }));
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Font' }).value).toBe('Arial');
  });
});

describe('the surface\u2019s theme', () => {
  const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
  const scope = { ownerId: 'o', documentId: 'd', shareCode: null };
  it('reads Standard for none, and saves a choice with the settings, applying the record', async () => {
    const onWorkbook = vi.fn();
    const ocean = SPREADSHEET_THEMES[2]!;
    const saved = { ...record, settings: { ...record.settings, theme: ocean } };
    vi.mocked(apiSaveWorkbookSettings).mockResolvedValueOnce({ workbook: saved, rev: 1 });
    const { result } = renderHook(() => useSpreadsheetThemeState(scope, record, onWorkbook));
    expect(result.current.theme).toBe(STANDARD_THEME);
    expect(await result.current.choose(ocean)).toBe(true);
    expect(apiSaveWorkbookSettings).toHaveBeenCalledWith(scope, {
      ...record.settings,
      theme: ocean,
    });
    expect(onWorkbook).toHaveBeenCalledWith(saved);
    vi.mocked(apiSaveWorkbookSettings).mockRejectedValueOnce(new Error('offline'));
    expect(await result.current.choose(ocean)).toBe(false);
    const none = renderHook(() => useSpreadsheetThemeState(scope, saved, undefined));
    vi.mocked(apiSaveWorkbookSettings).mockResolvedValueOnce({ workbook: saved, rev: 2 });
    expect(await none.result.current.choose(ocean)).toBe(true);
    expect(none.result.current.theme).toBe(ocean);
  });
  it('gives Standard outside a spreadsheet, and saves nothing', async () => {
    const { result } = renderHook(() => useSpreadsheetTheme());
    expect(result.current.theme).toBe(STANDARD_THEME);
    expect(await result.current.choose(STANDARD_THEME)).toBe(false);
  });
});
