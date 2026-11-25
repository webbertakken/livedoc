// Writes src/mark-face-data.ts, src/mark-font-data.ts, src/mark-face-urls.ts, src/mark-face-region-data.ts and src/mark-face-slices-<region>.ts
// from the Fontsource packages (docs/specs/035-pdf-documents/marks.md "Laying out", "Loading").
// Run: pnpm --filter @livedoc/pdf-documents faces:generate
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { MARK_FACE_REGIONS } from '../src/mark-face-families.ts';
import {
  markFaceDataSource,
  markFaceFilesOf,
  markFaceUrlsSource,
  markFontDataSource,
} from '../src/engine/mark-face-table.ts';
import {
  markFaceRegionDataSource,
  markFaceSlicesSource,
} from '../src/engine/mark-face-region-table.ts';

const require = createRequire(import.meta.url);
const read = async (file: string) =>
  new Uint8Array(readFileSync(require.resolve(`@fontsource/${file}`)));

function write(name: string, source: string) {
  writeFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), source);
  console.log(`[faces] wrote src/${name} (${source.length} bytes)`);
}

write('mark-face-data.ts', await markFaceDataSource(read));
write('mark-font-data.ts', await markFontDataSource(read));
write('mark-face-urls.ts', markFaceUrlsSource(markFaceFilesOf()));
write('mark-face-region-data.ts', await markFaceRegionDataSource(read));
for (const { region } of MARK_FACE_REGIONS)
  write(`mark-face-slices-${region}.ts`, await markFaceSlicesSource(read, region));
