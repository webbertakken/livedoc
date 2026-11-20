// Writes app/document-fonts.css from the Fontsource packages (docs/specs/004-interface-design/fonts.md "Served from
// LiveDoc"). Run: pnpm fonts:document
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DOCUMENT_FONTS, servedFamily } from '../../../packages/document/src/document-fonts.ts';
import { documentFontFaceCss } from '../lib/document-fonts/document-font-faces.ts';

const app = fileURLToPath(new URL('../', import.meta.url));
const css = documentFontFaceCss(DOCUMENT_FONTS, servedFamily, (path) =>
  readFileSync(`${app}node_modules/@fontsource/${path}`, 'utf8'),
);
writeFileSync(`${app}app/document-fonts.css`, css);
console.log(`[fonts] wrote app/document-fonts.css (${css.length} bytes)`);
