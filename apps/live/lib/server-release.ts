// What this page has heard of the server's release (docs/specs/016-platform/new-version-prompt.md,
// docs/specs/016-platform/stale-builds.md): the document format number and the live build id. Fed by
// every api response's headers (apiFetch) and the realtime room's `format` message; read by the new
// version prompt and the stale build navigation. Module state: one page, one server.
import { DOCUMENT_FORMAT, parseBuildId, parseDocumentFormat } from '@livedoc/api-schema';
import { createListeners } from '@/lib/listeners';

/** The build id this editor was built with; null when the build set none (local development). */
export const EDITOR_BUILD_ID: string | null = parseBuildId(process.env.NEXT_PUBLIC_BUILD_ID);

let highestFormat: number | null = null;
let latestBuild: string | null = null;
// Another tab of this browser upgraded the offline store past this build (docs/specs/006-document/offline-mode.md
// "Other browser tabs during an upgrade"): a newer build is live, whatever the api has said.
let offlineStoreSuperseded = false;
// How many reasons to reload have arrived: a format above this editor's, each higher one, the store upgraded.
let reasons = 0;
const listeners = createListeners();

const notify = () => {
  listeners.notify();
};

/** Records a format number from the server; anything unparsable is ignored, and only a rise notifies. */
export function noteServerDocumentFormat(value: unknown): void {
  const format = parseDocumentFormat(value);
  if (format === null || (highestFormat !== null && format <= highestFormat)) return;
  highestFormat = format;
  if (format > DOCUMENT_FORMAT) reasons++;
  notify();
}

/** Records the server's live build id; anything unparsable is ignored, and only a change notifies. */
export function noteServerBuild(value: unknown): void {
  const build = parseBuildId(value);
  if (build === null || build === latestBuild) return;
  latestBuild = build;
  notify();
}

export function serverDocumentFormat(): number | null {
  return highestFormat;
}

export function serverBuild(): string | null {
  return latestBuild;
}

/** Records that a newer build upgraded this browser's offline store; only the first time notifies. */
export function noteOfflineStoreSuperseded(): void {
  if (offlineStoreSuperseded) return;
  offlineStoreSuperseded = true;
  reasons++;
  notify();
}

/** The server serves a document format newer than this editor was built for, or a newer build upgraded the offline store. */
export function newVersionAvailable(): boolean {
  return offlineStoreSuperseded || (highestFormat !== null && highestFormat > DOCUMENT_FORMAT);
}

/** How many reasons to reload have arrived on this page, so a dismissal can be outlived by a newer one. */
export function newVersionReason(): number {
  return reasons;
}

/** Stale: both build ids are known and differ. */
export function isStaleBuild(editor: string | null, server: string | null): boolean {
  return editor !== null && server !== null && editor !== server;
}

/** This page runs an older (or other) build than the one now live. */
export function runningStaleBuild(): boolean {
  return offlineStoreSuperseded || isStaleBuild(EDITOR_BUILD_ID, latestBuild);
}

export const subscribeServerRelease = listeners.subscribe;

export function resetServerReleaseForTests(): void {
  highestFormat = null;
  latestBuild = null;
  offlineStoreSuperseded = false;
  reasons = 0;
  listeners.clear();
}
