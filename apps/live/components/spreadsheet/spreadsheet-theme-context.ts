'use client';

// A spreadsheet's theme in the surface (docs/specs/029-sheets/formatting.md "Themes", D217): the workbook record's,
// Standard for one without, and an Editor's choice of another saved with the workbook's settings, applied without
// waiting for the room. The open sheet's engine draws in it; the Themes panel and the colour pickers read it.
import { createContext, useCallback, useContext, useMemo } from 'react';
import {
  themeOf,
  STANDARD_THEME,
  type SpreadsheetTheme,
  type WorkbookRecord,
} from '@livedoc/sheets';
import { apiSaveWorkbookSettings, type WorkbookScope } from '@/lib/api/workbook';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

export type SpreadsheetThemeState = {
  theme: SpreadsheetTheme;
  // Saves another theme; false when the api refused it or could not be reached.
  choose: (theme: SpreadsheetTheme) => Promise<boolean>;
};

const SpreadsheetThemeContext = createContext<SpreadsheetThemeState>({
  theme: STANDARD_THEME,
  choose: () => Promise.resolve(false),
});

export const SpreadsheetThemeProvider = SpreadsheetThemeContext.Provider;

export const useSpreadsheetTheme = (): SpreadsheetThemeState => useContext(SpreadsheetThemeContext);

/** The surface's theme state, from its workbook record. */
export function useSpreadsheetThemeState(
  scope: WorkbookScope,
  record: WorkbookRecord,
  onWorkbook: ((workbook: WorkbookRecord) => void) | undefined,
): SpreadsheetThemeState {
  const theme = themeOf(record.settings.theme);
  const choose = useCallback(
    async (next: SpreadsheetTheme) => {
      track('Spreadsheet', 'Changed', 'Theme');
      try {
        const { workbook } = await apiSaveWorkbookSettings(scope, {
          ...record.settings,
          theme: next,
        });
        onWorkbook?.(workbook);
        debugLog('[workbook] theme saved', { theme: next.id });
        return true;
      } catch (error) {
        debugLog('[workbook] theme not saved', { theme: next.id, error: String(error) });
        return false;
      }
    },
    [scope, record.settings, onWorkbook],
  );
  return useMemo(() => ({ theme, choose }), [theme, choose]);
}
