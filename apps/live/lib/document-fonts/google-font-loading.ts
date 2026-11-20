// Families from Google Fonts (docs/specs/004-interface-design/fonts.md "More fonts"): a family in use loads by its
// css2 stylesheet, its regular and bold, upright and italic; the Fonts dialog's rows in view load their names'
// letters only, renamed `LiveDoc preview <family>` so a preview never stands in for a family's full faces. A family
// that cannot load is marked, so the font menu can say so, and its text draws as the default family.
import { debugLog } from '@/lib/debug-log';
import type { GoogleFont } from './google-font-catalogue';

export const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2';

export type GoogleFontStatus = 'idle' | 'loading' | 'loaded' | 'failed';

export const previewFamily = (name: string): string => `LiveDoc preview ${name}`;

const familyName = (name: string) => encodeURIComponent(name).replace(/%20/g, '+');

export const googleFontHref = (font: GoogleFont): string =>
  `${GOOGLE_FONTS_CSS}?family=${familyName(font.name)}${font.axes ? `:${font.axes}` : ''}&display=swap`;

export function googlePreviewHref(fonts: readonly GoogleFont[]): string {
  const families = fonts.map((f) => `family=${familyName(f.name)}`).join('&');
  const letters = [...new Set(fonts.flatMap((f) => [...f.name]))].join('');
  return `${GOOGLE_FONTS_CSS}?${families}&text=${encodeURIComponent(letters)}&display=swap`;
}

export const renamePreviewCss = (css: string): string =>
  css.replace(
    /font-family:(\s*)'([^']+)'/g,
    (_, space: string, name: string) => `font-family:${space}'${previewFamily(name)}'`,
  );

export type GoogleFontLoads = {
  status: (name: string) => GoogleFontStatus;
  /** Every family asked for and how it stands, by lowercase name: a new map whenever one changes. */
  statuses: () => ReadonlyMap<string, GoogleFontStatus>;
  load: (font: GoogleFont) => void;
  preview: (fonts: readonly GoogleFont[]) => Promise<void>;
  subscribe: (listener: () => void) => () => void;
};

export function createGoogleFontLoads(
  fetchCss: (href: string) => Promise<Response>,
): GoogleFontLoads {
  let statuses: ReadonlyMap<string, GoogleFontStatus> = new Map();
  const previewed = new Set<string>();
  const listeners = new Set<() => void>();
  const key = (name: string) => name.toLowerCase();
  const settle = (name: string, status: GoogleFontStatus) => {
    statuses = new Map([...statuses, [key(name), status]]);
    for (const listener of listeners) listener();
  };
  return {
    status: (name) => statuses.get(key(name)) ?? 'idle',
    statuses: () => statuses,
    load: (font) => {
      if (statuses.has(key(font.name))) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = googleFontHref(font);
      link.dataset.googleFont = font.name;
      link.addEventListener('load', () => {
        debugLog(`[fonts] google family loaded ${font.name}`);
        settle(font.name, 'loaded');
      });
      link.addEventListener('error', () => {
        debugLog(`[fonts] google family not loaded ${font.name}`);
        settle(font.name, 'failed');
      });
      settle(font.name, 'loading');
      document.head.append(link);
    },
    preview: async (fonts) => {
      const fresh = fonts.filter((f) => !previewed.has(key(f.name)));
      if (fresh.length === 0) return;
      for (const f of fresh) previewed.add(key(f.name));
      try {
        const response = await fetchCss(googlePreviewHref(fresh));
        if (!response.ok) throw new Error(String(response.status));
        const style = document.createElement('style');
        style.dataset.googleFontPreview = '';
        style.textContent = renamePreviewCss(await response.text());
        document.head.append(style);
      } catch (error) {
        debugLog(`[fonts] google preview not loaded ${String(error)}`);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let shared: GoogleFontLoads | null = null;

/** The page's one set of loads, made on first use (the browser's own fetch). */
export function googleFontLoads(): GoogleFontLoads {
  shared ??= createGoogleFontLoads((href) => fetch(href));
  return shared;
}
