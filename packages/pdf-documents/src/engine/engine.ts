// The engine over a started reader (docs/specs/035-pdf-documents/security.md "The boundary"): one reader and one
// writer behind the one interface. It holds one open stored file.
import type { PDF } from '@libpdf/core';
import type { BakeResult, PageInfo, PdfEngine, PdfOpened } from '../engine-contract';
import { FileSignature } from '../file-signature';
import { PdfLiveChanges } from '../live-changes';
import { bakeChanges } from './bake';
import { PdfReader, type Pdfium } from './reader';
import { signerOf } from './signer';
import { layersOf, openWriter } from './writer';

/** The engine over a started reader; `write` is the writer, the engine's own unless a test hands another. */
export function pdfEngineOver(pdfium: Pdfium, write: typeof bakeChanges = bakeChanges): PdfEngine {
  const reader = new PdfReader(pdfium);
  let stored: Uint8Array<ArrayBuffer> | null = null;
  // The file held while its password is asked, and the password it opened with: both the engine's alone.
  let waiting: Uint8Array<ArrayBuffer> | null = null;
  let password: string | null = null;
  let pages: readonly PageInfo[] = [];
  // The open file as the writer reads it, read once and only when asked: it reads the whole file a second time.
  let written: Promise<PDF | null> | null = null;
  const writer = (): Promise<PDF | null> =>
    stored ? (written ??= openWriter(stored, password)) : Promise.resolve(null);

  const opening = (bytes: Uint8Array<ArrayBuffer>, given: string | null): PdfOpened => {
    const opened = reader.open(bytes, given ?? '');
    stored = opened.ok ? bytes : null;
    password = opened.ok ? given : null;
    waiting = !opened.ok && opened.needsPassword ? bytes : null;
    written = null;
    pages = opened.ok ? opened.pages : [];
    return opened;
  };

  async function bake(liveChanges: Uint8Array): Promise<BakeResult> {
    if (!stored) return { ok: false, refusal: 'unreadable' };
    if (!PdfLiveChanges.decodes(liveChanges)) return { ok: false, refusal: 'unreadable' };
    const changes = PdfLiveChanges.load([liveChanges]);
    // Empty live changes are never baked: the stored file itself is handed out (saving.md "An unchanged file").
    if (PdfLiveChanges.isEmpty(changes))
      return { ok: true, bytes: stored, kind: 'unchanged', anchorsLost: 0, fieldsLost: 0 };
    const turns = PdfLiveChanges.pageTurns(changes);
    const baked = await write(
      stored,
      {
        marks: PdfLiveChanges.marks(changes),
        fieldValues: PdfLiveChanges.fieldValues(changes),
        removed: PdfLiveChanges.removed(changes),
        turns,
      },
      password,
    );
    if (!baked.ok) return baked;
    // Handed out only once the reader has opened it again with the pages it had, each turned page standing as it
    // was turned (saving.md "The validators' claim").
    const check = new PdfReader(pdfium);
    const reopened = check.open(baked.bytes, password ?? '');
    check.close();
    const stands =
      reopened.ok &&
      reopened.pages.length === pages.length &&
      pages.every(
        ({ name }, at) => !turns.has(name) || reopened.pages[at]!.rotation === turns.get(name),
      );
    return stands ? baked : { ok: false, refusal: 'reopen' };
  }

  return {
    open: async (bytes) => opening(bytes, null),
    unlock: async (given) => {
      const held = waiting ?? stored;
      if (!held) return { ok: false, refusal: 'pdf_damaged' };
      const before = { stored, password };
      const opened = opening(held, given);
      if (opened.ok || !opened.needsPassword) return opened;
      // A wrong permissions password leaves an open file open, as it was.
      if (before.stored) opening(before.stored, before.password);
      return { ...opened, wrong: true };
    },
    drawPage: async (index, scale) => reader.drawPage(index, scale),
    outline: async () => reader.outline(),
    links: async (index) => reader.links(index),
    pageText: async (index) => reader.pageText(index),
    selectText: async (index, from, to) => reader.selectText(index, from, to),
    fileMarks: async (index) => reader.fileMarks(index),
    fields: async (index) => reader.fields(index),
    signatures: async () => {
      const bytes = stored?.length ?? 0;
      return reader
        .signatures()
        .map(({ read, contents }) =>
          FileSignature.of(read, bytes, contents ? signerOf(contents) : null),
        );
    },
    embeddedFiles: async () => reader.embeddedFiles(),
    layers: async () => layersOf(await writer()),
    canAppend: async () => (await writer())?.canSaveIncrementally() === null,
    bake,
    close: async () => {
      reader.close();
      stored = waiting = password = written = null;
      pages = [];
    },
  };
}
