'use client';

// The Themes side panel's body (docs/specs/029-sheets/formatting.md "Themes", D217): the theme in use with Customise,
// then every theme as a card, a press applying it at once; Customise changes the font and the nine colours, each
// applied at once as a theme named Custom, and Done returns to the list.
import { useState } from 'react';
import { DOCUMENT_FONTS, DocumentFonts } from '@livedoc/document';
import { Button, Select } from '@livedoc/ui';
import {
  customisedTheme,
  SPREADSHEET_THEMES,
  THEME_COLOUR_KEYS,
  THEME_COLOUR_LABELS,
  type SpreadsheetTheme,
} from '@livedoc/sheets';
import { ColourSwatchButton } from '@/components/colour/ColourSwatchButton';
import { OFFICE_COLOUR_ROWS } from '@/components/office/OfficeColourControl';
import { useDocumentColours } from '@/hooks/ui/useDocumentColours';
import { useSpreadsheetTheme } from './spreadsheet-theme-context';

export const THEME_NOT_SAVED = 'The theme could not be saved. Try again.';

// The families Customise offers: the Font menu's served ones, Arial first.
const THEME_FONTS = ['Arial', ...DOCUMENT_FONTS.filter((f) => f.menu).map((f) => f.name)];
// The picker without a theme row: a theme's colours are what it sets.
const NO_THEME: readonly never[] = [];

function ThemeCard({
  theme,
  pressed,
  onPick,
}: {
  theme: SpreadsheetTheme;
  pressed: boolean;
  onPick: () => void;
}) {
  const { colours } = theme;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={theme.name}
      onClick={onPick}
      className="flex cursor-pointer flex-col gap-1 rounded-control border border-slate-200 p-2 text-left hover:bg-slate-50 aria-pressed:ring-2 aria-pressed:ring-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:hover:bg-slate-800"
      style={{ background: colours.background, color: colours.text }}
    >
      <span className="text-body" style={{ fontFamily: DocumentFonts.stack(theme.font) }}>
        {theme.name}
      </span>
      <span aria-hidden className="flex gap-1">
        {THEME_COLOUR_KEYS.slice(2, 8).map((key) => (
          <span
            key={key}
            className="size-icon-chevron rounded-full"
            style={{ background: colours[key] }}
          />
        ))}
      </span>
    </button>
  );
}

export function SpreadsheetThemesBody() {
  const { theme, choose } = useSpreadsheetTheme();
  const yours = useDocumentColours();
  const [customising, setCustomising] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const apply = (next: SpreadsheetTheme) =>
    void choose(next).then((saved) => setWhy(saved ? null : THEME_NOT_SAVED));
  const problem = why ? (
    <p role="alert" className="text-supporting text-red-700 dark:text-red-300">
      {why}
    </p>
  ) : null;
  if (customising)
    return (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-supporting text-slate-600 dark:text-slate-300">Font</span>
          <Select
            aria-label="Font"
            value={theme.font}
            onChange={(e) => apply(customisedTheme(theme, { font: e.target.value }))}
          >
            {(THEME_FONTS.includes(theme.font) ? THEME_FONTS : [theme.font, ...THEME_FONTS]).map(
              (font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ),
            )}
          </Select>
        </label>
        <div role="group" aria-label="Theme Colours" className="grid grid-cols-3 gap-2">
          {THEME_COLOUR_KEYS.map((key) => (
            <span key={key} className="flex items-center gap-2 text-supporting">
              <ColourSwatchButton
                label={THEME_COLOUR_LABELS[key]}
                swatch={theme.colours[key]}
                value={theme.colours[key]}
                theme={NO_THEME}
                standard={OFFICE_COLOUR_ROWS}
                yours={yours}
                onPick={(id) =>
                  apply(customisedTheme(theme, { colours: { [key]: id.toLowerCase() } }))
                }
              />
              {THEME_COLOUR_LABELS[key]}
            </span>
          ))}
        </div>
        {problem}
        <div className="flex justify-end">
          <Button size="xs" onClick={() => setCustomising(false)}>
            Done
          </Button>
        </div>
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body">
          Theme: <strong>{theme.name}</strong>
        </span>
        <Button variant="secondary" size="xs" onClick={() => setCustomising(true)}>
          Customise
        </Button>
      </div>
      {problem}
      <div role="group" aria-label="Themes" className="grid grid-cols-2 gap-2">
        {SPREADSHEET_THEMES.map((t) => (
          <ThemeCard key={t.id} theme={t} pressed={t.id === theme.id} onPick={() => apply(t)} />
        ))}
      </div>
    </div>
  );
}
