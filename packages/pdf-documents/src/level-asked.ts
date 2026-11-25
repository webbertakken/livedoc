// The level an update to a PDF document's live changes asks (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "The room's op kinds"): the room judges a Participant's update by what it touches,
// never by what its sender says. Read by applying the update to the stored state and asking Yjs which roots it
// landed in; `removed` and `stored` are judged by what they hold, before against after.
import type * as Y from 'yjs';
import { touchedRoots } from '@livedoc/live-updates';
import { canonical } from './canonical';
import { PdfLiveChanges, type PdfRoot } from './live-changes';

/** The least level an update needs, or that it stands on changes the stored state lacks and cannot be judged. */
export type PdfLevelAsked = 'participate' | 'edit' | 'unreadable';

/** The roots Reviewing changes; of `removed`, only what was a mark of the stored file. */
export const PDF_REVIEWING_ROOTS = [
  'marks',
  'threads',
  'fieldValues',
  'recognised',
  'removed',
] as const satisfies readonly PdfRoot[];

type Held = Record<string, unknown>;

const kindOf = (entry: unknown): unknown =>
  typeof entry === 'object' && entry !== null && 'kind' in entry ? entry.kind : undefined;

/** A Participant may add or take back only what was a mark of the stored file. */
function removedAsksEdit(before: Held, after: Held): boolean {
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (canonical(before[id]) === canonical(after[id])) continue;
    for (const entry of [before[id], after[id]])
      if (entry !== undefined && kindOf(entry) !== 'mark') return true;
  }
  return false;
}

/** A Participant may name the stored file once, as the tab names it; after that it must read as it did. */
function storedAsksEdit(doc: Y.Doc, before: Held, after: Held, tabBlob: string | null): boolean {
  if (canonical(before) === canonical(after)) return false;
  if (Object.keys(before).length > 0 || Object.keys(after).length !== 2) return true;
  const stored = PdfLiveChanges.stored(doc);
  return stored === null || stored.blob !== tabBlob;
}

/**
 * The least level `update` needs on the state `stored` makes. `tabBlob`: the stored file the tab names, the only
 * one a Participant's update may say the changes are on.
 */
export function pdfLevelAsked(
  stored: readonly Uint8Array[],
  update: Uint8Array,
  tabBlob: string | null,
): PdfLevelAsked {
  const doc = PdfLiveChanges.load(stored);
  const storedRoot = doc.getMap<unknown>('stored');
  const removedRoot = doc.getMap<unknown>('removed');
  const storedBefore: Held = storedRoot.toJSON();
  const removedBefore: Held = removedRoot.toJSON();
  const touched = touchedRoots(doc, update);
  if (touched === 'unreadable') return 'unreadable';
  const reviewing: readonly string[] = PDF_REVIEWING_ROOTS;
  for (const name of touched) {
    if (name !== 'stored' && !reviewing.includes(name)) return 'edit';
  }
  if (removedAsksEdit(removedBefore, removedRoot.toJSON())) return 'edit';
  if (storedAsksEdit(doc, storedBefore, storedRoot.toJSON(), tabBlob)) return 'edit';
  return 'participate';
}
