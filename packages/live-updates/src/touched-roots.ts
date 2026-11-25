// The roots a Yjs update lands in (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"): a live tab
// kind's room judges a Participant's update by what it touches, never by what its sender says. Read by applying the
// update to the stored state and asking Yjs which types each transaction changed, each counted as its root's.
import * as Y from 'yjs';

/** The roots touched, by name, or `unreadable`: the update stands on changes the state lacks, or is no update. */
export type TouchedRoots = ReadonlySet<string> | 'unreadable';

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

/** Applies `update` to `doc` and names the roots it landed in. */
export function touchedRoots(doc: Y.Doc, update: Uint8Array): TouchedRoots {
  const touched = new Set<SharedType>();
  const watch = (transaction: Y.Transaction) => {
    for (const type of transaction.changed.keys()) touched.add(rootOf(type));
  };
  doc.on('afterTransaction', watch);
  try {
    Y.applyUpdate(doc, update);
    if (!holdsAll(doc, update)) return 'unreadable';
  } catch {
    return 'unreadable';
  } finally {
    doc.off('afterTransaction', watch);
  }
  const names = new Set<string>();
  for (const [name, type] of doc.share) if (touched.has(type)) names.add(name);
  return names;
}
