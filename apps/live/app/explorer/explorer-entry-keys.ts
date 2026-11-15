// A view's entries as one list of keys, folders first, for the windowed list
// (docs/specs/013-workspace/explorer-structure.md "Long lists"). Keyed by kind as well as id, as a folder and a
// document never share a row.
import { useMemo } from 'react';

export function entryKeys(
  folders: readonly { id: string }[],
  documents: readonly { id: string }[],
): string[] {
  return [...folders.map((f) => `folder:${f.id}`), ...documents.map((d) => `document:${d.id}`)];
}

export function useEntryKeys(
  folders: readonly { id: string }[],
  documents: readonly { id: string }[],
): string[] {
  return useMemo(() => entryKeys(folders, documents), [folders, documents]);
}
