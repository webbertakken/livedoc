// A board's About (docs/specs/021-event-storming/asks.md "About This Domain"): what the person says the domain is,
// kept with the tab so every reading, prompt and export is headed by it. A person's words: data, never instructions.

/** The longest About, characters (safe range: 500 to 8000; it travels in every reading). */
export const ABOUT_MAX = 2000;

const clean = (text: unknown): string =>
  typeof text === 'string' ? text.trim().slice(0, ABOUT_MAX) : '';

/** The board's About: trimmed and cut to the limit; empty when it has none. */
export function aboutOf(tab: { esAbout?: unknown }): string {
  return clean(tab.esAbout);
}

/** The tab with `text` as its About, or without one when the text is blank; the tab itself when nothing changes. */
export function withAbout<T extends { esAbout?: unknown }>(tab: T, text: string): T {
  const next = clean(text);
  if (next === aboutOf(tab) && (next !== '' || tab.esAbout === undefined)) return tab;
  const { esAbout: _dropped, ...rest } = tab;
  return (next ? { ...rest, esAbout: next } : rest) as T;
}
