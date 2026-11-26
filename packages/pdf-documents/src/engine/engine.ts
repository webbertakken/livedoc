// The engine over a started reader (docs/specs/035-pdf-documents/security.md "The boundary"): one reader and one
// writer behind the one interface. It holds one open stored file.
import type { PDF } from '@libpdf/core';
import type { BakeResult, PageInfo, PdfEngine, PdfEngineLog, PdfOpened } from '../engine-contract';
import { StampPictureBytes } from '../custom-stamp';
import { pdfDigest } from '../digest';
import { FileSignature } from '../file-signature';
import { DARK_PAGES_LOG_EVERY } from '../limits';
import { PdfLiveChanges } from '../live-changes';
import { bakeChanges } from './bake';
import { cutPages } from './cut-pages';
import { PdfReader, type Pdfium } from './reader';
import { signerOf } from './signer';
import { loadTypesetter, markRunsOf, type MarkFaceSource, type Typesetter } from './typesetter';
import { layersOf, openWriter, withLayersSet } from './writer';

/**
 * The engine over a started reader; `write` is the writer, the engine's own unless a test hands another, and `log`
 * takes what the engine decides: fingerprints of its own words, never a file's. `faces` answers the mark faces' files
 * (marks.md "Loading"); with none, a bake whose marks need a face is refused.
 */
export function pdfEngineOver(
  pdfium: Pdfium,
  write: typeof bakeChanges = bakeChanges,
  log: PdfEngineLog = () => {},
  faces: MarkFaceSource | null = null,
): PdfEngine {
  const reader = new PdfReader(pdfium);
  /** An answer on its way out: what was held back in reading it is logged, once a call (security.md "The boundary"). */
  const said = <T>(answer: T): T => {
    for (const [what, count] of reader.takeClamped())
      log(`[pdf] value-clamped what=${what} count=${count}`);
    return answer;
  };
  // Dark pages (dark-pages.md "Telemetry and observability"): a step's time logged for the first and then one in
  // DARK_PAGES_LOG_EVERY; a failed step always.
  let darkSteps = 0;
  const stepped = <T>(drawer: PdfReader, drawn: T): T => {
    const step = drawer.takeDarkStep();
    if (step && 'failed' in step) log('[pdf] dark-pages step-failed');
    else if (step && darkSteps++ % DARK_PAGES_LOG_EVERY === 0)
      log(`[pdf] dark-pages step ms=${Math.round(step.ms)} pictures=${step.pictures}`);
    return drawn;
  };
  let stored: Uint8Array<ArrayBuffer> | null = null;
  // The file held while its password is asked, and the password it opened with: both the engine's alone.
  let waiting: Uint8Array<ArrayBuffer> | null = null;
  let password: string | null = null;
  let pages: readonly PageInfo[] = [];
  // The open file as the writer reads it, read once and only when asked: it reads the whole file a second time.
  let written: Promise<PDF | null> | null = null;
  const writer = (): Promise<PDF | null> =>
    stored ? (written ??= openWriter(stored, password)) : Promise.resolve(null);

  // A person's layers (reading-surface.md "Layers"): pages drawn from a copy of the file whose layers are set so,
  // read by a reader of its own, made when asked and kept while the same layers are asked. The stored file and the
  // writer's copy of it are never touched: the copy is written from a writer of its own.
  let view: { key: string; reader: PdfReader | null } | null = null;
  // The file's own marks the pages are drawn without (marks.md "Changing a mark"), for every reader that draws them.
  let marksHidden: readonly string[] = [];
  const dropView = () => {
    view?.reader?.close();
    view = null;
  };
  const drawerFor = async (hidden: readonly string[] | undefined): Promise<PdfReader> => {
    if (!hidden || !stored) return reader;
    const key = [...new Set(hidden)].toSorted().join(' ');
    if (view?.key !== key) {
      dropView();
      const bytes = await withLayersSet(await openWriter(stored, password), new Set(hidden));
      const copy = bytes ? new PdfReader(pdfium) : null;
      const read = copy?.open(bytes!, password ?? '');
      if (copy && read?.ok) {
        copy.hideMarks(marksHidden);
        view = { key, reader: copy };
        log(`[pdf] layer-view hidden=${new Set(hidden).size}`);
      } else {
        copy?.close();
        view = { key, reader: null };
        if (bytes) log('[pdf] layer-view-failed');
      }
    }
    return view?.reader ?? reader;
  };

  const opening = (bytes: Uint8Array<ArrayBuffer>, given: string | null): PdfOpened => {
    const opened = reader.open(bytes, given ?? '');
    stored = opened.ok ? bytes : null;
    password = opened.ok ? given : null;
    waiting = !opened.ok && opened.needsPassword ? bytes : null;
    written = null;
    dropView();
    // Another file hides none of its marks until asked.
    marksHidden = [];
    reader.hideMarks(marksHidden);
    pages = opened.ok ? opened.pages : [];
    // security.md "Scripts": counted and never run.
    if (opened.ok && opened.document.scripts > 0)
      log(`[pdf] script-ignored count=${opened.document.scripts}`);
    return said(opened);
  };

  async function bake(
    liveChanges: Uint8Array,
    pictures: ReadonlyMap<string, Uint8Array> = new Map(),
  ): Promise<BakeResult> {
    if (!stored) return { ok: false, refusal: 'unreadable' };
    if (!PdfLiveChanges.decodes(liveChanges)) return { ok: false, refusal: 'unreadable' };
    const changes = PdfLiveChanges.load([liveChanges]);
    // Empty live changes are never baked: the stored file itself is handed out (saving.md "An unchanged file").
    if (PdfLiveChanges.isEmpty(changes))
      return { ok: true, bytes: stored, kind: 'unchanged', anchorsLost: 0, fieldsLost: 0 };
    const turns = PdfLiveChanges.pageTurns(changes);
    const marks = PdfLiveChanges.marks(changes);
    // A custom stamp's picture not handed in stops the bake by name, never a stamp written without it.
    const missing = pdfDigest(changes).blobKeys.filter((key) => !pictures.has(key));
    const unfit = marks.filter(
      (mark) =>
        mark.kind === 'stamp' &&
        mark.picture &&
        pictures.has(mark.picture.key) &&
        !StampPictureBytes.fit(mark.picture.type, pictures.get(mark.picture.key)!),
    );
    if (missing.length + unfit.length > 0) {
      log(`[pdf] pictures-missing count=${missing.length} unfit=${unfit.length}`);
      return { ok: false, refusal: 'pictures-unavailable' };
    }
    // The mark faces load only for a bake whose marks need them, and a face that does not load stops it by name,
    // never a silent question mark (marks.md "Loading").
    const needed = markRunsOf(marks);
    let typesetter: Typesetter | null = null;
    if (needed.length > 0) {
      const started = Date.now();
      const loaded = faces
        ? await loadTypesetter(needed, faces)
        : ({ ok: false, face: needed[0]!.face } as const);
      if (!loaded.ok) {
        log(`[pdf] faces-failed face=${loaded.face}`);
        return { ok: false, refusal: 'faces-unavailable' };
      }
      typesetter = loaded.typesetter;
      log(
        `[pdf] faces-loaded count=${typesetter.count} bytes=${typesetter.bytes} ms=${Date.now() - started}`,
      );
    }
    const baked = await write(
      stored,
      {
        marks,
        fieldValues: PdfLiveChanges.fieldValues(changes),
        removed: PdfLiveChanges.removed(changes),
        turns,
        pictures,
      },
      password,
      typesetter,
    );
    if (!baked.ok) return baked;
    if (baked.glyphsMissing > 0) log(`[pdf] glyphs-missing count=${baked.glyphsMissing}`);
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
    drawPage: async (index, scale, turns, hidden, look) => {
      const drawer = await drawerFor(hidden);
      return stepped(drawer, drawer.drawPage(index, scale, undefined, turns, look));
    },
    drawTile: async (index, scale, turns, rect, hidden, look) => {
      const drawer = await drawerFor(hidden);
      return stepped(drawer, drawer.drawTile(index, scale, turns, rect, look));
    },
    pageMatrix: async (index, turns) => said(reader.pageMatrix(index, turns)),
    outline: async () => said(reader.outline()),
    links: async (index) => said(reader.links(index)),
    pageText: async (index) => said(reader.pageText(index)),
    pageTags: async (index) => said(reader.pageTags(index)),
    selectText: async (index, from, to) => said(reader.selectText(index, from, to)),
    fileMarks: async (index) => said(reader.fileMarks(index)),
    fields: async (index) => said(reader.fields(index)),
    signatures: async () => {
      const bytes = stored?.length ?? 0;
      return said(reader.signatures()).map(({ read, contents }) =>
        FileSignature.of(read, bytes, contents ? signerOf(contents) : null),
      );
    },
    embeddedFiles: async () => said(reader.embeddedFiles()),
    embeddedFile: async (at) => {
      const read = reader.embeddedFile(at);
      log(
        read.ok
          ? `[pdf] embedded-read bytes=${read.bytes.length}`
          : `[pdf] embedded-refused reason=${read.refusal}`,
      );
      return read;
    },
    layers: async () => {
      const { layers, cut } = layersOf(await writer());
      if (cut) log('[pdf] value-clamped what=list count=1');
      return layers;
    },
    layerView: async (hidden) => (await drawerFor(hidden)) !== reader,
    hideMarks: async (ids) => {
      marksHidden = [...new Set(ids)];
      reader.hideMarks(marksHidden);
      view?.reader?.hideMarks(marksHidden);
      log(`[pdf] marks-hidden count=${marksHidden.length}`);
    },
    canAppend: async () => (await writer())?.canSaveIncrementally() === null,
    repaired: async () => (await writer())?.recoveredViaBruteForce ?? false,
    bake,
    cutPages: async (bytes, indexes) => cutPages(bytes, indexes, password),
    heldBytes: async () => reader.heldBytes(),
    close: async () => {
      dropView();
      reader.close();
      stored = waiting = password = written = null;
      pages = [];
    },
  };
}
