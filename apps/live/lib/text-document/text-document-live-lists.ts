// The live state's lists, read and watched (docs/specs/034-text-documents/lists.md), for the surface's list actions and
// the list markers drawn in the writing.
import type { RefObject } from 'react';
import type * as Y from 'yjs';
import { TextDocumentState } from '@livedoc/text-documents';
import type { Lists } from './text-document-lists';

/** Reads the live state's lists; none before it is bound. */
export const listsReader = (liveDoc: RefObject<Y.Doc | null>) => (): Lists =>
  liveDoc.current ? TextDocumentState.lists(liveDoc.current) : {};

/** Tells `listener` of any change to the live state's lists, by anyone. */
export function subscribeLists(doc: Y.Doc, listener: () => void): () => void {
  const lists = TextDocumentState.listsType(doc);
  lists.observe(listener);
  return () => lists.unobserve(listener);
}
