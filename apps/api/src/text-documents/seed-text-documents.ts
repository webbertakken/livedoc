// A new document's text documents made from files (docs/specs/034-text-documents/files-and-print.md "Opening") or
// from a copy's live states (live-editing-and-storage.md "Copies"): the create request names each text document tab
// and the file it opens (with the import's type for a file of another kind, read into ODF), or the state it holds, as
// base64; the room reads each file with the package's guards and stores its body as the tab's first update, and stores
// a state as it is.
import {
  tabKindOf,
  textDocumentFormatOf,
  type Tab,
  type TextDocumentFormat,
} from '@livedoc/document';
import {
  DrawingPictures,
  importRecordOf,
  Pictures,
  isTextDocumentImportType,
  readTextDocumentFile,
  readTextDocumentImport,
  type TextDocumentImportType,
  TextDocumentState,
  type TextDocument,
} from '@livedoc/text-documents';
import { json } from '../responses';
import type { DocumentEnv } from '../types';
import { bytesOfBase64 } from '@livedoc/text-documents';
import { appendLiveTabUpdate, storeLiveTabState } from '../live-tabs/live-tab-store';
import { TEXT_DOCUMENT_LIVE_TAB } from './text-document-live-tab';
import { mediaIntoGallery } from './gallery-media';

export type TextDocumentSeed = { tabId: string; format: TextDocumentFormat } & (
  { file: Uint8Array; type?: TextDocumentImportType } | { state: Uint8Array }
);

const refusedSeed = (message: string) =>
  json({ error: 'text_document_seed_invalid', message }, { status: 400 });

/** The request's `textDocuments`, each naming one of its text document tabs, or the 400 to answer. */
export function readTextDocumentSeeds(
  raw: unknown,
  tabs: readonly Tab[] | null,
): TextDocumentSeed[] | Response {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return refusedSeed('textDocuments must be a list');
  const textTabs = new Map(
    (tabs ?? [])
      .filter((t) => tabKindOf(t) === 'text-document')
      .map((t) => [t.id, textDocumentFormatOf(t as { format?: unknown })] as const),
  );
  const seen = new Set<string>();
  const out: TextDocumentSeed[] = [];
  for (const entry of raw as unknown[]) {
    const { tabId, file, state, type } = (entry ?? {}) as {
      tabId?: unknown;
      file?: unknown;
      state?: unknown;
      type?: unknown;
    };
    if (typeof tabId !== 'string' || !textTabs.has(tabId) || seen.has(tabId))
      return refusedSeed('each file names one text document tab of the request');
    seen.add(tabId);
    const format = textTabs.get(tabId)!;
    if (state !== undefined) {
      const bytes = typeof state === 'string' ? bytesOfBase64(state) : null;
      if (!bytes || !TextDocumentState.decodes(bytes))
        return refusedSeed('state must be a Yjs update, base64');
      out.push({ tabId, format, state: bytes });
      continue;
    }
    const bytes = typeof file === 'string' ? bytesOfBase64(file) : null;
    if (!bytes) return refusedSeed('file must be base64');
    if (type === undefined) {
      out.push({ tabId, format, file: bytes });
      continue;
    }
    // An import is born in ODF (fork C5).
    if (!isTextDocumentImportType(type) || format !== 'odf')
      return refusedSeed(
        'type names an import (txt, md, html or rtf) into an ODF text document tab',
      );
    out.push({ tabId, format, file: bytes, type });
  }
  return out;
}

/**
 * A file's pictures keep their drawing names only for the drawing tabs of the text document they are read into
 * (objects.md "In the file"): one read of this document's drawing tabs of `tabId`, made only when a picture names one.
 */
async function withOwnDrawings(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
  document: TextDocument,
): Promise<TextDocument> {
  if (!Pictures.ofDocument(document).some((p) => p.drawing !== undefined)) return document;
  const rows = await env.DOCUMENT_DB.prepare(
    `SELECT t.id FROM tabs t
       JOIN document_tabs dt ON dt.tab_id = t.id AND dt.document_id = ?1
      WHERE t.drawing_of = ?2`,
  )
    .bind(documentId, tabId)
    .all<{ id: string }>();
  const own = new Set(rows.results.map((r) => r.id));
  const isOwn = (id: string) => own.has(id);
  const dropped = DrawingPictures.foreignNames(document, isOwn);
  if (dropped > 0)
    console.info(
      `[text-document] drawing names dropped document=${documentId} tab=${tabId} count=${dropped}`,
    );
  return DrawingPictures.keepOwn(document, isOwn);
}

// The HTTP status of each package rejection a seed can meet.
const REJECTION_STATUS: Record<string, number> = {
  package_too_large: 413,
  package_wrong_type: 415,
  document_too_large: 413,
  picture_too_large: 413,
};

/** Store each seed's body as its tab's first update; the first refusal is answered and nothing more is stored. */
export async function seedTextDocuments(
  env: DocumentEnv,
  documentId: string,
  // Who opens the files: their pictures go to this owner's gallery (objects.md "Where the bytes live").
  ownerId: string,
  seeds: readonly TextDocumentSeed[],
): Promise<{ ok: true } | { ok: false; status: number; body: unknown }> {
  for (const seed of seeds) {
    const started = Date.now();
    if ('state' in seed) {
      await storeLiveTabState(env, TEXT_DOCUMENT_LIVE_TAB, seed.tabId, seed.state);
      console.info(
        `[text-document] copied document=${documentId} tab=${seed.tabId} bytes=${seed.state.byteLength} ms=${Date.now() - started}`,
      );
      continue;
    }
    const read = seed.type
      ? await readTextDocumentImport(seed.file, seed.type)
      : await readTextDocumentFile(seed.file);
    // A file keeps the format it arrived in (fork C1): one the tab is not held in is not this tab's to open.
    const arrived = read.ok && (read.fileType === 'docx' ? 'ooxml' : 'odf');
    if (read.ok && arrived !== seed.format) {
      console.warn(
        `[text-document] refused document=${documentId} tab=${seed.tabId} rejection=package_wrong_type format=${arrived}`,
      );
      return { ok: false, status: 415, body: { error: 'package_wrong_type' } };
    }
    if (!read.ok) {
      console.warn(
        `[text-document] refused document=${documentId} tab=${seed.tabId} rejection=${read.rejection} entry=${read.entry ?? '-'} line=${read.line ?? '-'}`,
      );
      return {
        ok: false,
        status: REJECTION_STATUS[read.rejection] ?? 400,
        body: { error: read.rejection, ...(read.entry ? { entry: read.entry } : {}) },
      };
    }
    const dropped = read.report.dropped.reduce((n, d) => n + d.count, 0);
    const kept = read.report.kept.reduce((n, k) => n + k.count, 0);
    if (dropped > 0) console.info(`[package] dropped document=${documentId} items=${dropped}`);
    const named = await withOwnDrawings(env, documentId, seed.tabId, read.document);
    const imported = await mediaIntoGallery(env, ownerId, named);
    const keptMedia = Object.entries(imported.kept);
    if (imported.gallery > 0 || keptMedia.length > 0)
      console.info(
        `[text-document] media document=${documentId} tab=${seed.tabId} gallery=${imported.gallery} kept=${keptMedia.reduce((n, [, c]) => n + c, 0)} refused=${keptMedia.map(([reason, c]) => `${reason}:${c}`).join(',') || '-'}`,
      );
    // The whole model goes into the live state, kept content included (live-editing-and-storage.md "The layout"),
    // with what reading it dropped and kept (files-and-print.md "Import report").
    await appendLiveTabUpdate(
      env,
      TEXT_DOCUMENT_LIVE_TAB,
      seed.tabId,
      TextDocumentState.fromDocument(
        imported.document,
        importRecordOf(seed.type ?? read.fileType, read.report),
      ),
    );
    console.info(
      `[text-document] file-read document=${documentId} tab=${seed.tabId} type=${seed.type ?? read.fileType} blocks=${read.document.body.length} kept=${kept} bytes=${seed.file.byteLength} report=dropped:${dropped},kept:${kept} ms=${Date.now() - started}`,
    );
  }
  return { ok: true };
}
