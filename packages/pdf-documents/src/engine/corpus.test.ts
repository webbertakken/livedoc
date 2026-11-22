import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PdfEngine } from '../engine-contract';
import { PdfLiveChanges } from '../live-changes';
import { corpusBytes, corpusFiles } from '../testing/corpus';
import { readerWasm } from '../testing/fixtures';
import { createPdfEngine } from './index';

let engine: PdfEngine;

beforeAll(async () => {
  engine = await createPdfEngine({ wasm: readerWasm() });
});

// opening.md "Opening any PDF": each opens here, or is refused with a named reason; none is changed by being opened.
describe('the corpus', () => {
  it('holds the files its manifest names, byte for byte', () => {
    for (const file of corpusFiles()) {
      const bytes = corpusBytes(file);
      expect(bytes.length, file.file).toBe(file.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), file.file).toBe(file.sha256);
    }
  });

  it.each(corpusFiles().filter((file) => file.refusal))(
    '$file is refused by name: $holds',
    async (file) => {
      expect(await engine.open(corpusBytes(file))).toEqual({ ok: false, refusal: file.refusal });
    },
  );

  it.each(corpusFiles().filter((file) => file.pages))(
    '$file opens and reads whole, unchanged: $holds',
    async (file) => {
      const bytes = corpusBytes(file);
      let opened = await engine.open(bytes);
      if (file.password) {
        // opening.md "Passwords": an open password is asked, never a refusal; a wrong one leaves the engine waiting.
        expect(opened).toEqual({ ok: false, needsPassword: true });
        expect(await engine.unlock('not the password')).toMatchObject({ ok: false, wrong: true });
        opened = await engine.unlock(file.password);
      }
      if (!opened.ok) throw new Error(`${file.file} did not open`);
      expect(opened.pages).toHaveLength(file.pages!);
      // Everything the engine reads of a file is read, and none of it traps.
      await engine.outline();
      await engine.signatures();
      await engine.embeddedFiles();
      await engine.layers();
      for (const [index, page] of opened.pages.entries()) {
        await engine.pageText(index);
        await engine.links(index);
        await engine.fileMarks(index);
        await engine.fields(index);
        const drawn = await engine.drawPage(index, 0.5);
        expect(drawn!.width).toBe(Math.max(1, Math.floor(page.width * 0.5)));
        expect(drawn!.height).toBe(Math.max(1, Math.floor(page.height * 0.5)));
      }
      // opening.md "Damaged files": a file opened only by being repaired takes no addition.
      expect(await engine.canAppend()).toBe(!file.repaired && !file.unwritable);
      // saving.md "An unchanged file": reading changed nothing, and what nobody changed leaves as it came.
      const baked = await engine.bake(PdfLiveChanges.merge([]));
      expect(baked.ok && baked.kind).toBe('unchanged');
      expect(baked.ok && baked.bytes).toBe(bytes);
      expect(bytes).toEqual(corpusBytes(file));
    },
  );
});
