// Writes app/document-fonts.css and lib/document-fonts/document-font-files.ts from the Fontsource packages
// (docs/specs/004-interface-design/fonts.md "Served from LiveDoc"). Run: pnpm fonts:document
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DOCUMENT_FONTS, servedFamily } from '../../../packages/document/src/document-fonts.ts';
import {
  documentFontFaceCss,
  documentFontFilesSource,
} from '../lib/document-fonts/document-font-faces.ts';

const app = fileURLToPath(new URL('../', import.meta.url));
const css = documentFontFaceCss(DOCUMENT_FONTS, servedFamily, (path) =>
  readFileSync(`${app}node_modules/@fontsource/${path}`, 'utf8'),
);
writeFileSync(`${app}app/document-fonts.css`, css);
console.log(`[fonts] wrote app/document-fonts.css (${css.length} bytes)`);
const files = documentFontFilesSource(DOCUMENT_FONTS, (path) =>
  existsSync(`${app}node_modules/@fontsource/${path}`),
);
writeFileSync(`${app}lib/document-fonts/document-font-files.ts`, files);
console.log(`[fonts] wrote lib/document-fonts/document-font-files.ts (${files.length} bytes)`);
