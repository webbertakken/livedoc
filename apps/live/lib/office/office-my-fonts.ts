// My fonts (docs/specs/004-interface-design/fonts.md "The font menu", "More fonts"): the families the font menu lists,
// in alphabetical order, kept in this browser. It starts as the catalogue's menu families; storage that cannot be
// read, or holds none, gives those again.
import { DocumentFonts } from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';

export const MY_FONTS_KEY = 'livedoc:v2:office-my-fonts';

const sorted = (names: readonly string[]): string[] =>
  [...new Set(names)].sort((a, b) => a.localeCompare(b, 'en'));

const lower = (name: string) => name.toLowerCase();

export const MyFonts = {
  has: (fonts: readonly string[], name: string): boolean =>
    fonts.some((n) => lower(n) === lower(name)),
  /** Adds a family missing, or takes out one there. */
  toggle: (fonts: readonly string[], name: string): string[] =>
    MyFonts.has(fonts, name)
      ? fonts.filter((n) => lower(n) !== lower(name))
      : sorted([...fonts, name]),
  same: (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((name) => MyFonts.has(b, name)),
} as const;

export function readMyFonts(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MY_FONTS_KEY) ?? 'null');
    const names = Array.isArray(parsed)
      ? parsed.filter((name): name is string => typeof name === 'string')
      : [];
    return names.length > 0 ? sorted(names) : [...DocumentFonts.menu()];
  } catch {
    return [...DocumentFonts.menu()];
  }
}

export function writeMyFonts(fonts: readonly string[]): void {
  try {
    localStorage.setItem(MY_FONTS_KEY, JSON.stringify(sorted(fonts)));
  } catch (error) {
    debugLog(`[office] my fonts not kept ${String(error)}`);
  }
}
