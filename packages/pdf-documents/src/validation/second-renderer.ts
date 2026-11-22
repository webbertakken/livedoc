// The second renderer (docs/specs/035-pdf-documents/saving.md "The validators' claim"): a page drawn by PDF.js, to
// hold the engine's own drawing of it against. PDF.js and its canvas are tools in the corpus's cache
// (scripts/fetch-pdf-corpus.sh), never dependencies of the workspace. Validation only: nothing here ships.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { ORACLE_FOLDER, PDF_CORPUS_DIR } from './fetched-corpus';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '../../scripts');
const OUT = mkdtempSync(join(tmpdir(), 'livedoc-second-renderer-'));
// The script's own exit code for a file PDF.js does not open or draw.
const NOT_DRAWN = 3;
/**
 * A page passes where it differs from the second renderer's on less of its pixels than this, in percent (saving.md
 * "The validators' claim"). Measured over the wider corpus: a median 0.04%, nine pages in ten under 0.62%.
 */
export const RENDER_TOLERANCE_PERCENT = 1;
/** How long the second renderer is given for one page: the slowest of the corpus takes under two seconds. */
export const SECOND_RENDERER_TIMEOUT_MS = 30_000;
/**
 * How far two colours may stand apart and still be the same pixel, and the edges both renderers smooth in their own
 * way left out: the research's measure, under which the two differ on a median 0.03% of a page.
 */
const SAME_PIXEL = { threshold: 0.3, includeAA: false };

/** A page drawn: RGBA, four bytes a pixel, row by row. */
export type Drawn = {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array | Uint8ClampedArray;
};

/** Why the second renderer drew no page: it refused the file, or it did not finish. */
export type NotDrawn = 'refused' | 'stopped';

/**
 * Page one of a file as PDF.js draws it on white, fitted to the size asked. The canvas PDF.js draws on is the build
 * for Linux on x64 (scripts/fetch-pdf-corpus.sh): elsewhere there is no second renderer, and this says so.
 */
export function drawnByPdfjs(
  file: string,
  { width, height }: { readonly width: number; readonly height: number },
  password?: string,
): Drawn | NotDrawn {
  if (process.platform !== 'linux' || process.arch !== 'x64')
    throw new Error(
      `the second renderer runs on Linux x64, CI's machine; this is ${process.platform} ${process.arch}`,
    );
  const out = join(OUT, 'page.rgba');
  const run = spawnSync(
    process.execPath,
    [
      join(SCRIPTS, 'draw-with-pdfjs.mjs'),
      join(PDF_CORPUS_DIR, ORACLE_FOLDER, 'node_modules'),
      file,
      out,
      String(width),
      String(height),
      ...(password ? [password] : []),
    ],
    { encoding: 'utf8', timeout: SECOND_RENDERER_TIMEOUT_MS },
  );
  if (run.status === NOT_DRAWN) return 'refused';
  if (run.status !== 0 || !existsSync(out)) return 'stopped';
  const rgba = new Uint8Array(readFileSync(out));
  rmSync(out);
  return rgba.length === width * height * 4 ? { width, height, rgba } : 'stopped';
}

/** The share of a page's pixels two drawings of it, of one size, differ on, in percent. */
export function differingShare(one: Drawn, other: Drawn): number {
  const differing = pixelmatch(one.rgba, other.rgba, null, one.width, one.height, SAME_PIXEL);
  return (100 * differing) / (one.width * one.height);
}
