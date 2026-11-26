// Their stamps (docs/specs/035-pdf-documents/custom-stamps.md "Where they are kept", "Placing one"): an owner's custom
// stamps, read from LiveDoc once a PDF offers them, newest first, held for the page so every PDF open shares one
// read; a stamp made here joins them at once. Their categories, in the order of their newest stamp, are the Stamp
// control's sections; a stamp's picture is read from this browser where it was kept, else from LiveDoc, and kept.
import { useEffect, useSyncExternalStore } from 'react';
import type { CustomStampRecord } from '@livedoc/pdf-documents';
import { apiListCustomStamps, apiReadCustomStampPicture } from '@/lib/api/custom-stamps';
import { debugLog } from '@/lib/debug-log';
import { createListeners } from '@/lib/listeners';
import { thisBrowserBlobs } from '@/lib/offline/offline-blobs';

export type CustomStampsPhase = 'idle' | 'loading' | 'ready' | 'failed';

export type CustomStampsRead = {
  readonly phase: CustomStampsPhase;
  readonly stamps: readonly CustomStampRecord[];
};

const IDLE: CustomStampsRead = { phase: 'idle', stamps: [] };

const reads = new Map<string, CustomStampsRead>();
const listeners = createListeners();

const set = (ownerId: string, read: CustomStampsRead) => {
  reads.set(ownerId, read);
  listeners.notify();
};

export const customStampsOf = (ownerId: string): CustomStampsRead => reads.get(ownerId) ?? IDLE;

/** Reads an owner's stamps from LiveDoc, once; a read that failed is tried again by the next call. */
export function loadCustomStamps(ownerId: string): void {
  const phase = customStampsOf(ownerId).phase;
  if (phase === 'loading' || phase === 'ready') return;
  set(ownerId, { phase: 'loading', stamps: customStampsOf(ownerId).stamps });
  apiListCustomStamps(ownerId).then(
    (stamps) => {
      debugLog(`[pdf] custom-stamps-read count=${stamps.length}`);
      set(ownerId, { phase: 'ready', stamps });
    },
    (error: unknown) => {
      debugLog('[pdf] custom-stamp-failed reason=list', String(error));
      set(ownerId, { phase: 'failed', stamps: [] });
    },
  );
}

/** A stamp just made, first among them. */
export function rememberCustomStamp(ownerId: string, stamp: CustomStampRecord): void {
  const { phase, stamps } = customStampsOf(ownerId);
  set(ownerId, {
    phase: phase === 'failed' ? 'idle' : phase,
    stamps: [stamp, ...stamps.filter((kept) => kept.id !== stamp.id)],
  });
}

/** Their stamps as LiveDoc answered a change with them all. */
export function replaceCustomStamps(ownerId: string, stamps: readonly CustomStampRecord[]): void {
  set(ownerId, { phase: 'ready', stamps });
}

/** One of their stamps as changed, in its place; one deleted (null), gone. */
export function changedCustomStamp(
  ownerId: string,
  id: string,
  stamp: CustomStampRecord | null,
): void {
  const { phase, stamps } = customStampsOf(ownerId);
  set(ownerId, {
    phase,
    stamps: stamp
      ? stamps.map((kept) => (kept.id === id ? stamp : kept))
      : stamps.filter((kept) => kept.id !== id),
  });
}

/** Reads their stamps again, whatever was read before: after a change that failed. */
export function reloadCustomStamps(ownerId: string): void {
  set(ownerId, { phase: 'idle', stamps: customStampsOf(ownerId).stamps });
  loadCustomStamps(ownerId);
}

/** An owner's stamps, read once `enabled` (a PDF that offers them); none before. */
export function useCustomStamps(ownerId: string, enabled: boolean): readonly CustomStampRecord[] {
  useEffect(() => {
    if (enabled) loadCustomStamps(ownerId);
  }, [ownerId, enabled]);
  const read = useSyncExternalStore(
    listeners.subscribe,
    () => customStampsOf(ownerId),
    () => IDLE,
  );
  return enabled ? read.stamps : IDLE.stamps;
}

export type CustomStampSection = {
  readonly category: string;
  readonly stamps: readonly CustomStampRecord[];
};

/** Their stamps a category each, the categories in the order of their newest stamp, each newest first. */
export function customStampSections(
  stamps: readonly CustomStampRecord[],
): readonly CustomStampSection[] {
  const byCategory = new Map<string, CustomStampRecord[]>();
  for (const stamp of [...stamps].sort((a, b) => b.createdAt - a.createdAt)) {
    const section = byCategory.get(stamp.category) ?? [];
    section.push(stamp);
    byCategory.set(stamp.category, section);
  }
  return [...byCategory].map(([category, inIt]) => ({ category, stamps: inIt }));
}

/** A stamp's picture: this browser's where it keeps it, else read from LiveDoc and kept here. */
export async function customStampPicture(
  ownerId: string,
  stamp: CustomStampRecord,
): Promise<Uint8Array<ArrayBuffer>> {
  const blobs = thisBrowserBlobs();
  const kept = await blobs.readKept(stamp.picture.key);
  if (kept) return kept;
  const bytes = await apiReadCustomStampPicture(ownerId, stamp.id);
  await blobs.keepRead(stamp.picture.key, bytes);
  return bytes;
}

/** For tests: forget every owner's stamps. */
export function resetCustomStamps(): void {
  reads.clear();
  listeners.notify();
}
