// The hold on a document whose create has not landed (docs/specs/013-workspace/new-document-menu.md
// "Pending documents"): one promise per id, resolved when the create lands and never rejected, so a failed create
// keeps every request naming the document waiting until Try again lands. `apiFetch` and `isOfflineId` wait on it.
// Free of imports: the api client's funnel reads it.

type Hold = { promise: Promise<void>; release: () => void };

const holds = new Map<string, Hold>();

export function holdDocument(id: string): void {
  if (holds.has(id)) return;
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  holds.set(id, { promise, release });
}

export function releaseDocument(id: string): void {
  holds.get(id)?.release();
  holds.delete(id);
}

// What a request for the document waits on; null once landed or never held.
export function whenDocumentCreated(id: string): Promise<void> | null {
  return holds.get(id)?.promise ?? null;
}

// The held document a request's url names, if any. Ids are UUIDs, so naming one anywhere in the url is naming it.
export function heldDocumentIn(url: string): string | null {
  if (holds.size === 0) return null;
  for (const id of holds.keys()) if (url.includes(id)) return id;
  return null;
}

export function resetCreateHoldsForTests(): void {
  holds.clear();
}
