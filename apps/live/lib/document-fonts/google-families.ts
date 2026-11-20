// Families in use that LiveDoc does not serve (docs/specs/004-interface-design/fonts.md "Substitution", "More fonts"):
// those Google Fonts has load from it; the catalogue is read only when such a family is asked for.
import { DocumentFonts } from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';
import { loadGoogleFonts, type GoogleFont } from './google-font-catalogue';
import { googleFontLoads, type GoogleFontLoads } from './google-font-loading';

export async function loadGoogleFamilies(
  names: readonly string[],
  {
    catalogue = loadGoogleFonts,
    loads = googleFontLoads(),
  }: { catalogue?: () => Promise<readonly GoogleFont[]>; loads?: GoogleFontLoads } = {},
): Promise<void> {
  const wanted = new Set(names.filter((n) => !DocumentFonts.find(n)).map((n) => n.toLowerCase()));
  if (wanted.size === 0) return;
  try {
    for (const font of await catalogue()) if (wanted.has(font.name.toLowerCase())) loads.load(font);
  } catch (error) {
    debugLog(`[fonts] google catalogue not loaded ${String(error)}`);
  }
}
