import type { StormExportResponse } from '@livedoc/api-schema';
import {
  DOMAIN_EXPORT_LANGUAGES,
  DOMAIN_EXPORT_MAX_PREVIOUS_BYTES,
  isDomainLanguage,
  type DomainLanguage,
} from '@livedoc/storm-reading';
import { API_BASE, apiFetch, apiHeaders } from '@/lib/api/core';
import { ByteBudget } from './inflate';
import { listZip, readZipEntry } from './zip-reader';
import { writeZip } from './zip-writer';

// The editor's half of the zip export (docs/specs/021-event-storming/domain-export.md "The zip"): it reads an
// earlier zip, asks the api for the files, and writes them into the archive the person downloads.

// The language picked last for a board, on this device.
const LANGUAGE_KEY = (tabId: string) => `livedoc:v2:storm-export-language:${tabId}`;
// TypeScript the first time (default).
export const DEFAULT_DOMAIN_LANGUAGE: DomainLanguage = 'typescript';

export function rememberedLanguage(
  tabId: string,
  store: Pick<Storage, 'getItem'> | null,
): DomainLanguage {
  try {
    const saved = store?.getItem(LANGUAGE_KEY(tabId));
    return saved && isDomainLanguage(saved) ? saved : DEFAULT_DOMAIN_LANGUAGE;
  } catch {
    return DEFAULT_DOMAIN_LANGUAGE;
  }
}

export function rememberLanguage(
  tabId: string,
  language: DomainLanguage,
  store: Pick<Storage, 'setItem'> | null,
): void {
  try {
    store?.setItem(LANGUAGE_KEY(tabId), language);
  } catch {
    // Private mode or a full store: the choice is not remembered, the export still runs.
  }
}

export { DOMAIN_EXPORT_LANGUAGES };

export type EarlierExport =
  | { ok: true; files: Record<string, string> }
  | { ok: false; error: 'previous_unreadable' | 'previous_too_large' };

// An earlier export's zip, its text files by path. Folders are skipped; the api decides whether it is an export.
export async function readEarlierExport(bytes: Uint8Array<ArrayBuffer>): Promise<EarlierExport> {
  const listed = listZip(bytes);
  if (!listed.ok) return { ok: false, error: 'previous_unreadable' };
  const budget = new ByteBudget(DOMAIN_EXPORT_MAX_PREVIOUS_BYTES);
  const files: Record<string, string> = {};
  const decoder = new TextDecoder();
  for (const entry of listed.entries) {
    if (entry.name.endsWith('/')) continue;
    const read = await readZipEntry(bytes, entry, budget);
    if (!read.ok)
      return {
        ok: false,
        error: read.refusal === 'too-large' ? 'previous_too_large' : 'previous_unreadable',
      };
    files[entry.name] = decoder.decode(read.bytes);
  }
  return { ok: true, files };
}

export type DomainExportResult =
  ({ ok: true } & StormExportResponse) | { ok: false; error: string };

// Ask the api for the zip's files. A refusal comes back as its error token.
export async function requestDomainExport(input: {
  ownerId: string;
  share: string | null;
  documentId: string;
  tabId: string;
  language: DomainLanguage;
  previous: Record<string, string> | null;
  // The bundle alone, without the model (the fallback after the model failed).
  bundleOnly?: boolean;
  signal: AbortSignal;
}): Promise<DomainExportResult> {
  const res = await apiFetch(
    `${API_BASE}/documents/${encodeURIComponent(input.documentId)}/tabs/${encodeURIComponent(input.tabId)}/storm-export`,
    {
      method: 'POST',
      headers: await apiHeaders(input.ownerId, { body: true, share: input.share }),
      body: JSON.stringify({
        language: input.language,
        ...(input.previous ? { previous: input.previous } : {}),
        ...(input.bundleOnly ? { bundleOnly: true } : {}),
      }),
      signal: input.signal,
    },
  );
  if (res.ok) return { ok: true, ...((await res.json()) as StormExportResponse) };
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return { ok: false, error: typeof body?.error === 'string' ? body.error : 'export_failed' };
}

// The files as the zip the person downloads.
export function domainExportZip(files: Record<string, string>, when = new Date()): Blob {
  const encoder = new TextEncoder();
  const entries = Object.entries(files).map(([name, text]) => ({
    name,
    data: encoder.encode(text),
  }));
  return new Blob([writeZip(entries, when)], { type: 'application/zip' });
}
