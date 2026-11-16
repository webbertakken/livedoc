// The early reads pool (docs/specs/016-platform/web-performance.md "The open path asks in parallel"). On a page load
// at a document's address, the open path's reads are asked while the editor's code still downloads
// (lib/open-path/early-document-reads.ts); each answer waits here, unread, until the editor's own request for the
// same address with the same headers takes it (apiFetch). A request as anyone else, or with another password, has
// another key and misses. Every route carries this module (apiFetch is everywhere): it stays a leaf.
import { debugLog } from '../debug-log';

// How long the pool lives from the page opening it: early answers are taken within it or forgotten, and the page's
// own reads are noted within it, so none is asked twice. Long enough for the editor's code to arrive on a slow
// link (about 4 s at 4 Mbit/s, 15 s at 1 Mbit/s); an answer older than this is too stale to open a document with.
// Safe range: 10 to 120 s.
export const EARLY_READS_WINDOW_MS = 60_000;

// What an early read is, for the trace lines: never its address, which can carry a share code.
export type EarlyReadLabel = 'participant' | 'share' | 'document' | 'tab';

type Answer = { label: EarlyReadLabel; response: Promise<Response | null> };

let openedAt: number | null = null;
const answers = new Map<string, Answer>();
// The reads the page asked itself while the pool was open, which the early path must not ask again.
const askedByPage = new Set<string>();

// Opens the pool for this page load. Called once, as the page starts at a document's address.
export function openEarlyReads(): void {
  if (openedAt !== null) return;
  openedAt = Date.now();
  debugLog('[early-reads] opened');
}

function isOpen(): boolean {
  if (openedAt === null) return false;
  if (Date.now() - openedAt <= EARLY_READS_WINDOW_MS) return true;
  if (answers.size > 0) debugLog(`[early-reads] closed unused=${answers.size}`);
  answers.clear();
  askedByPage.clear();
  return false;
}

// One key per address and exact header set: header names are case-insensitive, and Headers lists them sorted.
function keyOf(url: string, headers: HeadersInit | undefined): string {
  return [url, ...[...new Headers(headers)].map(([name, value]) => `${name}:${value}`)].join('\n');
}

// Asks a read early and keeps its answer for the page. Resolves the asker's own copy of the answer (null when the
// network failed); returns null, asking nothing, when the pool is closed or the read was already asked.
export function askEarly(
  label: EarlyReadLabel,
  url: string,
  headers: HeadersInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response | null> | null {
  if (!isOpen()) return null;
  const key = keyOf(url, headers);
  if (askedByPage.has(key) || answers.has(key)) {
    debugLog(`[early-reads] skipped ${label} asked=already`);
    return null;
  }
  const response = fetchImpl(url, { headers }).then(
    (res) => res,
    (err: unknown) => {
      // Not kept: the page asks itself, and reports the failure if it is still there.
      answers.delete(key);
      debugLog(`[early-reads] failed ${label} ${String(err)}`);
      return null;
    },
  );
  answers.set(key, { label, response });
  debugLog(`[early-reads] asked ${label}`);
  return response.then((res) => res?.clone() ?? null);
}

// Only a plain read can take an early answer: no write, no body, nothing that could abort it.
function isPlainRead(init: RequestInit | undefined): boolean {
  if (!init) return true;
  const method = (init.method ?? 'GET').toUpperCase();
  return method === 'GET' && Object.keys(init).every((k) => k === 'headers' || k === 'method');
}

// The early answer to this request, taken (a second take misses), or null when there is none: then the request
// is noted as the page's own, so no early read asks it again. The answer resolves null when the network failed.
export function takeEarlyRead(
  url: string,
  init: RequestInit | undefined,
): Promise<Response | null> | null {
  if (!isPlainRead(init) || !isOpen()) return null;
  const key = keyOf(url, init?.headers);
  const answer = answers.get(key);
  if (!answer) {
    askedByPage.add(key);
    return null;
  }
  answers.delete(key);
  debugLog(`[early-reads] taken ${answer.label}`);
  return answer.response;
}

export function resetEarlyReadsForTests(): void {
  openedAt = null;
  answers.clear();
  askedByPage.clear();
}
