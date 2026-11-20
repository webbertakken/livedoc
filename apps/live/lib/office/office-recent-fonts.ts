// The families a person chose last in a font menu (docs/specs/004-interface-design/fonts.md "The font menu"): the five
// most recent, newest first, in this browser. Unreadable or full storage forgets, and the menu shows no recent ones.
import { debugLog } from '@/lib/debug-log';

export const RECENT_FONTS_KEY = 'livedoc:v2:office-recent-fonts';
export const RECENT_FONTS_MAX = 5;

export function readRecentFonts(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_FONTS_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((name): name is string => typeof name === 'string').slice(0, RECENT_FONTS_MAX)
      : [];
  } catch {
    return [];
  }
}

export function noteRecentFont(name: string): void {
  const next = [name, ...readRecentFonts().filter((n) => n !== name)].slice(0, RECENT_FONTS_MAX);
  try {
    localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(next));
  } catch (error) {
    debugLog(`[office] recent fonts not kept ${String(error)}`);
  }
}
