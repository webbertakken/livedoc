// The engine over a started reader (docs/specs/035-pdf-documents/security.md "The boundary"): one reader and one
// writer behind the one interface. It holds one open stored file.
import type { BakeResult, PdfEngine } from '../engine-contract';
import { PdfLiveChanges } from '../live-changes';
import { bakeAddition } from './bake';
import { PdfReader, type Pdfium } from './reader';

/** The engine over a started reader; `write` is the writer, the engine's own unless a test hands another. */
export function pdfEngineOver(
  pdfium: Pdfium,
  write: typeof bakeAddition = bakeAddition,
): PdfEngine {
  const reader = new PdfReader(pdfium);
  let stored: Uint8Array<ArrayBuffer> | null = null;

  async function bake(liveChanges: Uint8Array): Promise<BakeResult> {
    if (!stored) return { ok: false, refusal: 'unreadable' };
    if (!PdfLiveChanges.decodes(liveChanges)) return { ok: false, refusal: 'unreadable' };
    const changes = PdfLiveChanges.load([liveChanges]);
    // Empty live changes are never baked: the stored file itself is handed out (saving.md "An unchanged file").
    if (PdfLiveChanges.isEmpty(changes))
      return { ok: true, bytes: stored, kind: 'unchanged', anchorsLost: 0 };
    const added = await write(stored, PdfLiveChanges.marks(changes));
    if (!added.ok) return added;
    // Handed out only once the reader has opened it again with the pages it had (saving.md "The validators' claim").
    const check = new PdfReader(pdfium);
    const reopened = check.open(added.bytes);
    const pages = check.pageCount();
    check.close();
    if (!reopened.ok || pages !== reader.pageCount()) return { ok: false, refusal: 'reopen' };
    return { ok: true, bytes: added.bytes, kind: 'addition', anchorsLost: added.anchorsLost };
  }

  return {
    open: async (bytes) => {
      const opened = reader.open(bytes);
      stored = opened.ok ? bytes : null;
      return opened;
    },
    drawPage: async (index, scale) => reader.drawPage(index, scale),
    selectText: async (index, from, to) => reader.selectText(index, from, to),
    fileMarks: async (index) => reader.fileMarks(index),
    bake,
    close: async () => {
      reader.close();
      stored = null;
    },
  };
}
