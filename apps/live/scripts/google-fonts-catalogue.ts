// Writes lib/document-fonts/google-fonts.json from Google Fonts' public metadata (docs/specs/004-interface-design/
// fonts.md "More fonts"), one family per line. Run: pnpm fonts:google
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  GOOGLE_FONTS_METADATA,
  googleFontCatalogueOf,
} from '../lib/document-fonts/google-font-catalogue.ts';

const response = await fetch(GOOGLE_FONTS_METADATA);
if (!response.ok) throw new Error(`[fonts] google metadata ${response.status}`);
// The metadata answers behind an anti-JSON-hijacking prefix.
const text = (await response.text()).replace(/^\)\]\}'\s*/, '');
const catalogue = googleFontCatalogueOf(JSON.parse(text) as unknown);
const lines = catalogue.families.map(
  (row) => `    [${row.map((value) => JSON.stringify(value)).join(', ')}]`,
);
const json = `{\n  "source": ${JSON.stringify(catalogue.source)},\n  "families": [\n${lines.join(',\n')}\n  ]\n}\n`;
const out = fileURLToPath(new URL('../lib/document-fonts/google-fonts.json', import.meta.url));
writeFileSync(out, json);
console.log(
  `[fonts] wrote google-fonts.json (${catalogue.families.length} families, ${json.length} bytes)`,
);
