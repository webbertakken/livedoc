// The engine over a started reader (docs/specs/035-pdf-documents/security.md "The boundary"): one reader and one
// writer behind the one interface. It holds one open stored file.
import type { BakeResult, PdfEngine, PdfLayer, PdfOpened } from '../engine-contract';
import { FileSignature } from '../file-signature';
import { PdfLiveChanges } from '../live-changes';
import { bakeAddition } from './bake';
import { PdfReader, type Pdfium } from './reader';
import { signerOf } from './signer';
import { layersOf } from './writer';

/** The engine over a started reader; `write` is the writer, the engine's own unless a test hands another. */
export function pdfEngineOver(
  pdfium: Pdfium,
  write: typeof bakeAddition = bakeAddition,
): PdfEngine {
  const reader = new PdfReader(pdfium);
  let stored: Uint8Array<ArrayBuffer> | null = null;
  // The file held while its password is asked, and the password it opened with: both the engine's alone.
  let waiting: Uint8Array<ArrayBuffer> | null = null;
  let password: string | null = null;
  // The layers of the open file, read once: the writer reads the whole file to answer them.
  let layers: Promise<readonly PdfLayer[]> | null = null;

  const opening = (bytes: Uint8Array<ArrayBuffer>, given: string | null): PdfOpened => {
    const opened = reader.open(bytes, given ?? '');
    stored = opened.ok ? bytes : null;
    password = opened.ok ? given : null;
    waiting = !opened.ok && opened.needsPassword ? bytes : null;
    layers = null;
    return opened;
  };

  async function bake(liveChanges: Uint8Array): Promise<BakeResult> {
    if (!stored) return { ok: false, refusal: 'unreadable' };
    if (!PdfLiveChanges.decodes(liveChanges)) return { ok: false, refusal: 'unreadable' };
    const changes = PdfLiveChanges.load([liveChanges]);
    // Empty live changes are never baked: the stored file itself is handed out (saving.md "An unchanged file").
    if (PdfLiveChanges.isEmpty(changes))
      return { ok: true, bytes: stored, kind: 'unchanged', anchorsLost: 0 };
    const added = await write(stored, PdfLiveChanges.marks(changes), password);
    if (!added.ok) return added;
    // Handed out only once the reader has opened it again with the pages it had (saving.md "The validators' claim").
    const check = new PdfReader(pdfium);
    const reopened = check.open(added.bytes, password ?? '');
    const pages = check.pageCount();
    check.close();
    if (!reopened.ok || pages !== reader.pageCount()) return { ok: false, refusal: 'reopen' };
    return { ok: true, bytes: added.bytes, kind: 'addition', anchorsLost: added.anchorsLost };
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
    layers: async () => (stored ? (layers ??= layersOf(stored, password)) : []),
    bake,
    close: async () => {
      reader.close();
      stored = waiting = password = layers = null;
    },
  };
}
