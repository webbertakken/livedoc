// Page one of a PDF as PDF.js draws it, on white, at the size asked: the second renderer the engine's pages are compared with
// (docs/specs/035-pdf-documents/saving.md "The validators' claim"). Run once a file by
// src/validation/second-renderer.ts, as a process of its own, so a file that hangs or crashes PDF.js ends only this.
// PDF.js and its canvas come from the cache scripts/fetch-pdf-corpus.sh fills, never from the workspace.
//
//   node draw-with-pdfjs.mjs <the cache's oracle/node_modules> <file.pdf> <out> <width> <height> [password]
//
// The page is fitted to the width and the height in pixels, as the engine fits it: two renderers that each rounded a
// page's size their own way would differ along every edge. Writes the pixels as RGBA, row by row.
// Exits 0 when the page is drawn, 3 when PDF.js does not open or draw the file (its reason on stderr).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const NOT_DRAWN = 3;
const [modules, file, out, widthAsked, heightAsked, password] = process.argv.slice(2);
const width = Number(widthAsked);
const height = Number(heightAsked);
if (!modules || !file || !out || !(width > 0) || !(height > 0)) {
  console.error(
    'usage: draw-with-pdfjs.mjs <oracle node_modules> <file.pdf> <out> <width> <height> [password]',
  );
  process.exit(2);
}

const pdfjs = join(modules, 'pdfjs-dist');
const folder = (name) => `${join(pdfjs, name)}/`;
const { getDocument } = await import(pathToFileURL(join(pdfjs, 'legacy/build/pdf.mjs')).href);

try {
  const task = getDocument({
    data: new Uint8Array(readFileSync(file)),
    password,
    verbosity: 0,
    cMapUrl: folder('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: folder('standard_fonts'),
    wasmUrl: folder('wasm'),
    iccUrl: folder('iccs'),
  });
  const document = await task.promise;
  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const { canvas, context } = document.canvasFactory.create(width, height);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  const transform = [width / viewport.width, 0, 0, height / viewport.height, 0, 0];
  await page.render({ canvasContext: context, viewport, canvas, transform }).promise;
  writeFileSync(out, Buffer.from(context.getImageData(0, 0, width, height).data.buffer));
  await task.destroy();
  process.exit(0);
} catch (error) {
  console.error(String(error?.message ?? error).slice(0, 200));
  process.exit(NOT_DRAWN);
}
