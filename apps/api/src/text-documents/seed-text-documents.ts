// A new document's text documents made from files (docs/specs/034-text-documents/files-and-print.md "Opening") or
// from a copy's live states (live-editing-and-storage.md "Copies"): the create request names each text document tab
// and the file it opens, or the state it holds, as base64; the room reads each file with the package's guards and
// stores its body as the tab's first update, and stores a state as it is.
import {
  tabKindOf,
  textDocumentFormatOf,
  type Tab,
  type TextDocumentFormat,
} from '@livedoc/document';
import { readTextDocumentFile, TextDocumentState } from '@livedoc/text-documents';
import { json } from '../responses';
import type { DocumentEnv } from '../types';
import { bytesOfBase64 } from '@livedoc/text-documents';
import { appendLiveTabUpdate, storeLiveTabState } from '../live-tabs/live-tab-store';
import { TEXT_DOCUMENT_LIVE_TAB } from './text-document-live-tab';

export type TextDocumentSeed = { tabId: string; format: TextDocumentFormat } & (
  { file: Uint8Array } | { state: Uint8Array }
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
    const { tabId, file, state } = (entry ?? {}) as {
      tabId?: unknown;
      file?: unknown;
      state?: unknown;
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
    out.push({ tabId, format, file: bytes });
  }
  return out;
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
    const read = await readTextDocumentFile(seed.file);
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
    // The whole model goes into the live state, kept content included (live-editing-and-storage.md "The layout").
    await appendLiveTabUpdate(
      env,
      TEXT_DOCUMENT_LIVE_TAB,
      seed.tabId,
      TextDocumentState.fromDocument(read.document),
    );
    console.info(
      `[text-document] file-read document=${documentId} tab=${seed.tabId} blocks=${read.document.body.length} kept=${kept} bytes=${seed.file.byteLength} ms=${Date.now() - started}`,
    );
  }
  return { ok: true };
}
