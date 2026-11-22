// The level an update to a PDF document's live changes asks (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "The room's op kinds"): the room judges a Participant's update by what it touches,
// never by what its sender says. Read by applying the update to the stored state and asking Yjs which roots it
// landed in; `removed` and `stored` are judged by what they hold, before against after.
import * as Y from 'yjs';
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

/** A shared type as a transaction names the ones it changed. */
type SharedType = Y.Transaction['changed'] extends Map<infer Type, unknown> ? Type : never;

const rootOf = (type: SharedType): SharedType => {
  let node = type;
  while (node._item !== null) node = node._item.parent as SharedType;
  return node;
};

/** Whether the document holds every item and deletion the update carries: none stands on something missing. */
function holdsAll(doc: Y.Doc, update: Uint8Array): boolean {
  const { structs, ds } = Y.decodeUpdate(update);
  const held = Y.decodeStateVector(Y.encodeStateVector(doc));
  const within = (client: number, end: number) => end <= (held.get(client) ?? 0);
  if (!structs.every((struct) => within(struct.id.client, struct.id.clock + struct.length)))
    return false;
  for (const [client, deleted] of ds.clients)
    if (!deleted.every((range) => within(client, range.clock + range.len))) return false;
  return true;
}

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
  const touched = new Set<SharedType>();
  doc.on('afterTransaction', (transaction: Y.Transaction) => {
    for (const type of transaction.changed.keys()) touched.add(rootOf(type));
  });
  try {
    Y.applyUpdate(doc, update);
    if (!holdsAll(doc, update)) return 'unreadable';
  } catch {
    return 'unreadable';
  }
  const reviewing: readonly string[] = PDF_REVIEWING_ROOTS;
  for (const [name, type] of doc.share) {
    if (!touched.has(type)) continue;
    if (name !== 'stored' && !reviewing.includes(name)) return 'edit';
  }
  if (removedAsksEdit(removedBefore, removedRoot.toJSON())) return 'edit';
  if (storedAsksEdit(doc, storedBefore, storedRoot.toJSON(), tabBlob)) return 'edit';
  return 'participate';
}
