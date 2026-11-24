// Writes src/mark-face-data.ts and src/mark-face-urls.ts from the Fontsource packages
// (docs/specs/035-pdf-documents/marks.md "Laying out", "Loading").
// Run: pnpm --filter @livedoc/pdf-documents faces:generate
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { markFaceDataSource, markFaceUrlsSource } from '../src/engine/mark-face-table.ts';
import { MARK_FACE_DATA } from '../src/mark-face-data.ts';

const require = createRequire(import.meta.url);
const source = await markFaceDataSource(
  async (file) => new Uint8Array(readFileSync(require.resolve(`@fontsource/${file}`))),
);
const out = fileURLToPath(new URL('../src/mark-face-data.ts', import.meta.url));
writeFileSync(out, source);
console.log(`[faces] wrote src/mark-face-data.ts (${source.length} bytes)`);
const urls = markFaceUrlsSource(MARK_FACE_DATA.map((face) => face.file));
writeFileSync(fileURLToPath(new URL('../src/mark-face-urls.ts', import.meta.url)), urls);
console.log(`[faces] wrote src/mark-face-urls.ts (${urls.length} bytes)`);
