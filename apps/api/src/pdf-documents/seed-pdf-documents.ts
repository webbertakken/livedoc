// A new document's PDF tabs made with their live changes (docs/specs/035-pdf-documents/live-editing-and-storage.md
// "Copies, the Trash and versions"): a copy of one's own document, and a This Browser document moving to LiveDoc,
// name each PDF tab and the state it holds, a Yjs update as base64. The room stores each as the tab's state before
// anyone opens it.
import { pdfTabOf, type Tab } from '@livedoc/document';
import { PDF_LIVE_CHANGES_MAX_BYTES, PdfLiveChanges } from '@livedoc/pdf-documents';
import { bytesOfBase64 } from '@livedoc/text-documents';
import { storeLiveTabState } from '../live-tabs/live-tab-store';
import { json } from '../responses';
import type { DocumentEnv } from '../types';
import { PDF_LIVE_TAB } from './pdf-live-tab';

export type PdfSeed = { tabId: string; state: Uint8Array };

const refusedSeed = (message: string) => {
  console.warn(`[pdf] seed-refused name=pdf_seed_invalid why=${JSON.stringify(message)}`);
  return json({ error: 'pdf_seed_invalid', message }, { status: 400 });
};

/**
 * The request's `pdfDocuments`, each naming one of its PDF tabs, or the refusal to answer. `maxBytes`: the most
 * one state may be, the limit unless a test hands a smaller.
 */
export function readPdfSeeds(
  raw: unknown,
  tabs: readonly Tab[] | null,
  maxBytes = PDF_LIVE_CHANGES_MAX_BYTES,
): PdfSeed[] | Response {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return refusedSeed('pdfDocuments must be a list');
  const files = new Map(
    (tabs ?? []).flatMap((tab) => {
      const file = pdfTabOf(tab);
      return file ? [[tab.id, file.blob] as const] : [];
    }),
  );
  const seen = new Set<string>();
  const seeds: PdfSeed[] = [];
  for (const entry of raw as unknown[]) {
    const { tabId, state } = (entry ?? {}) as { tabId?: unknown; state?: unknown };
    if (typeof tabId !== 'string' || !files.has(tabId) || seen.has(tabId))
      return refusedSeed('each state names one PDF tab of the request');
    seen.add(tabId);
    const bytes = typeof state === 'string' ? bytesOfBase64(state) : null;
    if (!bytes || !PdfLiveChanges.decodes(bytes))
      return refusedSeed('state must be a Yjs update, base64');
    if (bytes.byteLength > maxBytes) {
      console.warn(`[pdf] seed-refused name=live_changes_too_large bytes=${bytes.byteLength}`);
      return json({ error: 'live_changes_too_large', limitBytes: maxBytes }, { status: 413 });
    }
    // The live changes are changes to the stored file their tab names, never another's.
    const on = PdfLiveChanges.stored(PdfLiveChanges.load([bytes]));
    if (on && on.blob !== files.get(tabId))
      return refusedSeed('state names another stored file than its tab');
    seeds.push({ tabId, state: bytes });
  }
  return seeds;
}

/** Stores each seed as its tab's state. */
export async function seedPdfDocuments(
  env: DocumentEnv,
  documentId: string,
  seeds: readonly PdfSeed[],
): Promise<void> {
  for (const seed of seeds) {
    await storeLiveTabState(env, PDF_LIVE_TAB, seed.tabId, seed.state);
    console.info(
      `[pdf] copied document=${documentId} tab=${seed.tabId} bytes=${seed.state.byteLength}`,
    );
  }
}
