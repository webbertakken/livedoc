// Where a live tab's parting copies are (docs/specs/035-pdf-documents/live-editing-and-storage.md "A page's last
// moment"): the browser's synchronous storage, a key a document, a tab and the browser tab that wrote it. Finding and
// forgetting them reads no copy, so the offline store, which the editor's first load carries, takes nothing of Yjs
// with it; reading and writing one is ./live-tab-parting.

export const LIVE_TAB_PARTING_PREFIX = 'livedoc:v2:live-tab-parting:';

export type PartingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/** The browser's synchronous storage, or null where a browser keeps it from the page. */
export function partingStorage(): PartingStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The key of the copy the browser tab named `writer` wrote of a tab. */
export const partingKey = (documentId: string, tabId: string, writer: string) =>
  `${LIVE_TAB_PARTING_PREFIX}${documentId}:${tabId}:${writer}`;

/** The keys of every copy left of a document, or of one tab of it. */
export function partingKeys(storage: PartingStorage, documentId: string, tabId?: string): string[] {
  const prefix =
    tabId === undefined
      ? partingKey(documentId, '', '').slice(0, -1)
      : partingKey(documentId, tabId, '');
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

/** Whether any tab of the document has a parting copy left. */
export function hasPartingCopies(storage: PartingStorage | null, documentId: string): boolean {
  return storage !== null && partingKeys(storage, documentId).length > 0;
}

/** Remove every parting copy of a document that is gone. Answers how many went. */
export function forgetPartingCopies(storage: PartingStorage | null, documentId: string): number {
  if (!storage) return 0;
  const keys = partingKeys(storage, documentId);
  for (const key of keys) storage.removeItem(key);
  return keys.length;
}
