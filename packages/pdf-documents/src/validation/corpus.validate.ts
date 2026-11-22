// The wider corpus, read and drawn (docs/specs/035-pdf-documents/opening.md "Opening any PDF", saving.md "The
// validators' claim"): every fetched file opens with its pages or is refused by name, in time, is read whole
// without a trap and left as it came, and its first page stands within 1% of the second renderer's, PDF.js, or is
// named with what differs. Run by `pnpm --filter @livedoc/pdf-documents validate:files`, in CI's Office files job.
// Needs `qpdf` (the derived files are made with it) and the cache scripts/fetch-pdf-corpus.sh fills.
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPdfEngine } from '../engine/index';
import type { PdfEngine, PdfOpened } from '../engine-contract';
import { PDF_OPEN_TIMEOUT_MS } from '../limits';
import { PdfLiveChanges } from '../live-changes';
import { readerWasm } from '../testing/fixtures';
import {
  fetchPdfCorpus,
  fetchedBytes,
  fetchedFiles,
  fetchedNames,
  fetchedPath,
  groupOf,
  type FetchedFile,
} from './fetched-corpus';
import { RENDER_TOLERANCE_PERCENT, differingShare, drawnByPdfjs } from './second-renderer';

const DERIVED = 'derived/';
const LOCKED = 'derived/aes256-locked.pdf';

let engine: PdfEngine;

beforeAll(async () => {
  fetchPdfCorpus();
  engine = await createPdfEngine({ wasm: readerWasm() });
});

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

async function opened(file: FetchedFile, bytes: Uint8Array<ArrayBuffer>): Promise<PdfOpened> {
  const first = await engine.open(bytes);
  if (!file.password) return first;
  // opening.md "Passwords": an open password is asked, never a refusal.
  expect(first).toEqual({ ok: false, needsPassword: true });
  return engine.unlock(file.password);
}

describe('the wider corpus', () => {
  it('holds every file the expectations name, and none besides', () => {
    const expected = fetchedFiles()
      .map(({ file }) => file)
      .filter((file) => !file.startsWith(DERIVED));
    expect(fetchedNames()).toEqual(expected.toSorted());
  });

  it.each(fetchedFiles().filter((file) => file.refusal))(
    '$file is refused by name',
    async (file) => {
      expect(await engine.open(fetchedBytes(file))).toEqual({ ok: false, refusal: file.refusal });
    },
  );

  describe.each(fetchedFiles().filter((file) => file.pages))('$file', (file) => {
    it(`opens in time and reads whole, unchanged: ${groupOf(file)}`, async () => {
      const bytes = fetchedBytes(file);
      const arrived = sha256(bytes);
      const started = performance.now();
      const result = await opened(file, bytes);
      // security.md "Abuse cases": no file holds the reader past `PDF_OPEN_TIMEOUT_MS`.
      expect(performance.now() - started).toBeLessThan(PDF_OPEN_TIMEOUT_MS);
      if (!result.ok) throw new Error(`${file.file} did not open`);
      expect(result.pages).toHaveLength(file.pages!);
      // Everything the engine reads of a file is read, and none of it traps.
      await engine.outline();
      await engine.signatures();
      await engine.embeddedFiles();
      await engine.layers();
      for (const index of result.pages.keys()) {
        await engine.pageText(index);
        await engine.links(index);
        await engine.fileMarks(index);
        await engine.fields(index);
      }
      // opening.md "Damaged files": a file opened only by being repaired takes no addition.
      expect(await engine.canAppend()).toBe(!file.repaired);
      // saving.md "An unchanged file": reading changed nothing, and what nobody changed leaves as it came.
      const baked = await engine.bake(PdfLiveChanges.merge([]));
      expect(baked.ok && baked.kind).toBe('unchanged');
      expect(baked.ok && sha256(baked.bytes)).toBe(arrived);
      expect(sha256(fetchedBytes(file))).toBe(arrived);
    });

    // saving.md "The validators' claim": a page stands within the tolerance of a second renderer's, or the file is
    // named with its measured share and what differs; the tolerance is never raised for one.
    it('draws its first page as the second renderer does, or says how it differs', async () => {
      const result = await opened(file, fetchedBytes(file));
      if (!result.ok) throw new Error(`${file.file} did not open`);
      const drawn = (await engine.drawPage(0, 1))!;
      const second = drawnByPdfjs(fetchedPath(file), drawn, file.password);
      if (file.undrawn) return expect(second).toBe('refused');
      if (typeof second === 'string') throw new Error(`the second renderer ${second} ${file.file}`);
      const share = differingShare(drawn, second);
      if (!file.differs) return expect(share).toBeLessThan(RENDER_TOLERANCE_PERCENT);
      // A named file still differs, and no further than when it was named: once it draws alike it is named no more.
      expect(share).toBeGreaterThanOrEqual(RENDER_TOLERANCE_PERCENT);
      expect(share).toBeLessThan(file.differs.under);
    });
  });

  // opening.md "Passwords": a PDF whose permissions forbid changes opens without a password and says what it asks.
  it('reads what a file locked against changes asks', async () => {
    const result = await engine.open(fetchedBytes({ file: LOCKED }));
    if (!result.ok) throw new Error('the locked file did not open');
    expect(result.document.encrypted).toBe(true);
    expect(result.document.permissions.changeContent).toBe(false);
    expect(result.document.permissions.copy).toBe(true);
  });
});
