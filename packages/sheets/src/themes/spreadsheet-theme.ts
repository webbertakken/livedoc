// A spreadsheet's theme (docs/specs/029-sheets/formatting.md "Themes", D217): a font and nine theme colours, the
// workbook's, kept in its settings. A cell's text or fill colour may name a theme colour (`theme:accent1`), drawn in
// the workbook's theme wherever the cell draws or leaves, so another theme restyles it.
import type { CellFormat } from '../sheet';

export const THEME_COLOUR_KEYS = [
  'text',
  'background',
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
  'link',
] as const;
export type ThemeColourKey = (typeof THEME_COLOUR_KEYS)[number];
export type ThemeColours = Readonly<Record<ThemeColourKey, string>>;

/** Each theme colour's name, as the picker and Customise show it. */
export const THEME_COLOUR_LABELS: Readonly<Record<ThemeColourKey, string>> = {
  text: 'Text',
  background: 'Background',
  accent1: 'Accent 1',
  accent2: 'Accent 2',
  accent3: 'Accent 3',
  accent4: 'Accent 4',
  accent5: 'Accent 5',
  accent6: 'Accent 6',
  link: 'Link',
};

/** A theme: the catalogue's by its id, or a customised one (`custom`). */
export type SpreadsheetTheme = {
  readonly id: string;
  readonly name: string;
  readonly font: string;
  readonly colours: ThemeColours;
};

const theme = (
  id: string,
  name: string,
  font: string,
  [text, background, accent1, accent2, accent3, accent4, accent5, accent6, link]: string[],
): SpreadsheetTheme => ({
  id,
  name,
  font,
  colours: {
    text,
    background,
    accent1,
    accent2,
    accent3,
    accent4,
    accent5,
    accent6,
    link,
  } as ThemeColours,
});

/** Standard: Arial with Google Sheets' colours, every workbook's until another is picked. */
export const STANDARD_THEME = theme('standard', 'Standard', 'Arial', [
  '#000000',
  '#ffffff',
  '#4285f4',
  '#ea4335',
  '#fbbc04',
  '#34a853',
  '#ff6d01',
  '#46bdc6',
  '#1155cc',
]);

/** LiveDoc's themes (D217), Standard first. */
export const SPREADSHEET_THEMES: readonly SpreadsheetTheme[] = [
  STANDARD_THEME,
  theme('paper', 'Paper', 'Merriweather', [
    '#2b2b2b',
    '#fffdf7',
    '#8c6d46',
    '#b5523b',
    '#c99a2e',
    '#5f7f4f',
    '#3f6e8c',
    '#7a5a8c',
    '#3f6e8c',
  ]),
  theme('ocean', 'Ocean', 'Roboto', [
    '#0b2540',
    '#ffffff',
    '#1a73e8',
    '#00838f',
    '#5e97f6',
    '#26a69a',
    '#283593',
    '#80deea',
    '#1a73e8',
  ]),
  theme('forest', 'Forest', 'Lora', [
    '#1e2a1e',
    '#ffffff',
    '#2e7d32',
    '#827717',
    '#558b2f',
    '#a1887f',
    '#33691e',
    '#c0ca33',
    '#2e7d32',
  ]),
  theme('sunset', 'Sunset', 'Montserrat', [
    '#3a1f1d',
    '#ffffff',
    '#e8710a',
    '#d93025',
    '#f9ab00',
    '#c2185b',
    '#8e24aa',
    '#ff8a65',
    '#c2185b',
  ]),
  theme('slate', 'Slate', 'Lexend', [
    '#1f2933',
    '#ffffff',
    '#52606d',
    '#3e4c59',
    '#7b8794',
    '#2186eb',
    '#e12d39',
    '#9aa5b1',
    '#2186eb',
  ]),
  theme('citrus', 'Citrus', 'Nunito', [
    '#263238',
    '#ffffff',
    '#7cb342',
    '#fdd835',
    '#fb8c00',
    '#00acc1',
    '#43a047',
    '#ffb300',
    '#00897b',
  ]),
  theme('mono', 'Mono', 'Roboto Mono', [
    '#111111',
    '#ffffff',
    '#333333',
    '#555555',
    '#777777',
    '#999999',
    '#bbbbbb',
    '#dddddd',
    '#111111',
  ]),
];

const PREFIX = 'theme:';
const COLOUR_RE = /^#[0-9a-f]{6}$/;
const NAME_MAX = 100;

/** A theme colour as a cell's format names it. */
export const themeColourRef = (key: ThemeColourKey): string => `${PREFIX}${key}`;

/** Whether a value names a theme colour (`theme:accent1`). */
export function isThemeColourRef(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.startsWith(PREFIX) &&
    (THEME_COLOUR_KEYS as readonly string[]).includes(v.slice(PREFIX.length))
  );
}

/** A colour as drawn: a theme colour in the theme, any other as it is. */
export function resolveColour(v: string | undefined, t: SpreadsheetTheme): string | undefined {
  return isThemeColourRef(v) ? t.colours[v.slice(PREFIX.length) as ThemeColourKey] : v;
}

/** A format with its theme colours drawn in the theme; the same format when it names none. */
export function themedFormat<F extends Pick<CellFormat, 'fc' | 'bg'>>(
  f: F | undefined,
  t: SpreadsheetTheme,
): F | undefined {
  if (!f || (!isThemeColourRef(f.fc) && !isThemeColourRef(f.bg))) return f;
  const out = { ...f };
  if (f.fc) out.fc = resolveColour(f.fc, t);
  if (f.bg) out.bg = resolveColour(f.bg, t);
  return out;
}

/** The workbook's theme: Standard for one without. */
export const themeOf = (t: SpreadsheetTheme | undefined): SpreadsheetTheme => t ?? STANDARD_THEME;

/** A theme customised from `base`: its font and colours changed, named Custom. */
export function customisedTheme(
  base: SpreadsheetTheme,
  change: { font?: string; colours?: Partial<Record<ThemeColourKey, string>> },
): SpreadsheetTheme {
  return {
    id: 'custom',
    name: 'Custom',
    font: change.font ?? base.font,
    colours: { ...base.colours, ...change.colours },
  };
}

const IDS = new Set([...SPREADSHEET_THEMES.map((t) => t.id), 'custom']);

/** A theme from the wire or the room, or null when it is not one. */
export function readTheme(raw: unknown): SpreadsheetTheme | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Record<string, unknown>;
  if (Object.keys(t).some((k) => !['id', 'name', 'font', 'colours'].includes(k))) return null;
  const text = (v: unknown): v is string =>
    typeof v === 'string' && v !== '' && v.length <= NAME_MAX;
  if (typeof t.id !== 'string' || !IDS.has(t.id) || !text(t.name) || !text(t.font)) return null;
  const c = t.colours;
  if (typeof c !== 'object' || c === null) return null;
  const colours = c as Record<string, unknown>;
  if (Object.keys(colours).length !== THEME_COLOUR_KEYS.length) return null;
  if (!THEME_COLOUR_KEYS.every((k) => typeof colours[k] === 'string' && COLOUR_RE.test(colours[k])))
    return null;
  return { id: t.id, name: t.name, font: t.font, colours: colours as ThemeColours };
}
